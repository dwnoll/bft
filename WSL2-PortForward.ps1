#requires -version 5.1
# Invocation: 'Set-ExecutionPolicy -Scope Process Bypass .\WSL2-PortForward.ps1'
<#
.SYNOPSIS
  Exposes a TCP service running in WSL2 through a selected Windows IPv4 address.

.DESCRIPTION
  Interactive mode:
    - Relaunches itself with administrator rights when required.
    - Lists active, non-loopback IPv4 addresses on Windows.
    - Lets the user select a WSL distribution.
    - Prompts for a Windows listen port and WSL destination port.
    - Creates/replaces a netsh v4tov4 portproxy rule.
    - Creates a Windows Firewall inbound rule for the Private profile.
    - Optionally creates an elevated logon task to refresh the WSL2 address.

  Refresh mode is used by the scheduled task and is not normally called manually.

.NOTES
  Save this script in a permanent location before creating the scheduled task.
  The forwarded service inside WSL must listen on the WSL interface (for example,
  0.0.0.0), not only on 127.0.0.1.
#>

[CmdletBinding()]
param(
    [string] $RefreshConfig
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Test-IsAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Restart-Elevated {
    if (-not $PSCommandPath) {
        throw 'The script must be saved as a .ps1 file before it can elevate itself.'
    }

    $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"{0}"' -f $PSCommandPath))
    if ($RefreshConfig) {
        $arguments += @('-RefreshConfig', ('"{0}"' -f $RefreshConfig))
    }

    Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList ($arguments -join ' ')
    exit
}

function Read-ChoiceIndex {
    param(
        [Parameter(Mandatory)] [string] $Prompt,
        [Parameter(Mandatory)] [int] $Maximum
    )

    while ($true) {
        $text = Read-Host $Prompt
        $number = 0
        if ([int]::TryParse($text, [ref] $number) -and $number -ge 1 -and $number -le $Maximum) {
            return $number - 1
        }
        Write-Warning "Enter a number from 1 through $Maximum."
    }
}

function Read-TcpPort {
    param(
        [Parameter(Mandatory)] [string] $Prompt,
        [int] $Default = 0
    )

    while ($true) {
        $suffix = if ($Default -gt 0) { " [$Default]" } else { '' }
        $text = Read-Host "$Prompt$suffix"
        if ([string]::IsNullOrWhiteSpace($text) -and $Default -gt 0) {
            return $Default
        }

        $port = 0
        if ([int]::TryParse($text, [ref] $port) -and $port -ge 1 -and $port -le 65535) {
            return $port
        }
        Write-Warning 'Enter a TCP port from 1 through 65535.'
    }
}

function Read-YesNo {
    param(
        [Parameter(Mandatory)] [string] $Prompt,
        [bool] $DefaultYes = $true
    )

    $marker = if ($DefaultYes) { '[Y/n]' } else { '[y/N]' }
    while ($true) {
        $answer = (Read-Host "$Prompt $marker").Trim().ToLowerInvariant()
        if (-not $answer) { return $DefaultYes }
        if ($answer -in @('y', 'yes')) { return $true }
        if ($answer -in @('n', 'no')) { return $false }
        Write-Warning 'Enter Y or N.'
    }
}

function Get-WslDistributions {
    # wsl.exe emits UTF-16 text in Windows PowerShell; removing NULs also makes
    # this work consistently when invoked from newer PowerShell versions.
    $output = (& wsl.exe --list --quiet 2>&1 | Out-String) -replace "`0", ''
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to list WSL distributions: $($output.Trim())"
    }

    return @($output -split "`r?`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}

function Get-WslIPv4Address {
    param([Parameter(Mandatory)] [string] $Distribution)

    $output = (& wsl.exe --distribution $Distribution -- hostname -I 2>&1 | Out-String) -replace "`0", ''
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to obtain the IP address for WSL distribution '$Distribution': $($output.Trim())"
    }

    $addresses = @($output -split '\s+' | Where-Object {
        $_ -and [System.Net.IPAddress]::TryParse($_, [ref] ([System.Net.IPAddress] $null)) -and
        ([System.Net.IPAddress]::Parse($_).AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork)
    })

    if ($addresses.Count -eq 0) {
        throw "WSL distribution '$Distribution' returned no IPv4 address."
    }

    # In the normal WSL2 NAT configuration, the first IPv4 address is eth0.
    return $addresses[0]
}

function Get-PortProxyRules {
    $lines = netsh interface portproxy show v4tov4
    if ($LASTEXITCODE -ne 0) { throw 'Unable to read existing portproxy rules.' }

    foreach ($line in $lines) {
        if ($line -match '^\s*(\S+)\s+(\d+)\s+(\S+)\s+(\d+)\s*$') {
            [pscustomobject]@{
                ListenAddress  = $Matches[1]
                ListenPort     = [int] $Matches[2]
                ConnectAddress = $Matches[3]
                ConnectPort    = [int] $Matches[4]
            }
        }
    }
}

function Set-WslPortForward {
    param(
        [Parameter(Mandatory)] [string] $ListenAddress,
        [Parameter(Mandatory)] [int] $ListenPort,
        [Parameter(Mandatory)] [string] $ConnectAddress,
        [Parameter(Mandatory)] [int] $ConnectPort,
        [switch] $ReplaceWithoutPrompt
    )

    $existing = @(Get-PortProxyRules | Where-Object {
        $_.ListenAddress -eq $ListenAddress -and $_.ListenPort -eq $ListenPort
    })

    if ($existing.Count -gt 0) {
        $replace = $ReplaceWithoutPrompt -or (Read-YesNo -Prompt (
            "A forwarding rule already exists for ${ListenAddress}:$ListenPort. Replace it?"
        ) -DefaultYes $true)
        if (-not $replace) { throw 'The existing rule was left unchanged.' }

        netsh interface portproxy delete v4tov4 `
            listenaddress=$ListenAddress listenport=$ListenPort protocol=tcp | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Unable to remove the existing portproxy rule.' }
    }

    netsh interface portproxy add v4tov4 `
        listenaddress=$ListenAddress listenport=$ListenPort `
        connectaddress=$ConnectAddress connectport=$ConnectPort protocol=tcp | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Unable to create the portproxy rule.' }
}

function Set-PrivateFirewallRule {
    param(
        [Parameter(Mandatory)] [string] $ListenAddress,
        [Parameter(Mandatory)] [int] $ListenPort
    )

    $safeAddress = $ListenAddress -replace '[^A-Za-z0-9_.-]', '_'
    $name = "WSL2 Port Forward TCP $safeAddress-$ListenPort"
    Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue |
        Remove-NetFirewallRule -ErrorAction Stop

    New-NetFirewallRule -DisplayName $name -Direction Inbound -Action Allow `
        -Protocol TCP -LocalAddress $ListenAddress -LocalPort $ListenPort `
        -Profile Private -Description 'Managed by WSL2-PortForward.ps1' | Out-Null
    return $name
}

function Register-RefreshTask {
    param(
        [Parameter(Mandatory)] [string] $ConfigPath,
        [Parameter(Mandatory)] [string] $TaskName
    )

    if (-not $PSCommandPath) { throw 'Cannot register a task for an unsaved script.' }

    $actionArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -RefreshConfig `"$ConfigPath`""
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $actionArgs
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
    $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" `
        -LogonType Interactive -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 5)

    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
        -Principal $principal -Settings $settings -Force `
        -Description 'Refreshes a Windows TCP portproxy rule after the WSL2 IP address changes.' | Out-Null
}

function Invoke-Refresh {
    param([Parameter(Mandatory)] [string] $ConfigPath)

    if (-not (Test-Path -LiteralPath $ConfigPath)) {
        throw "Refresh configuration not found: $ConfigPath"
    }

    $config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
    $wslAddress = Get-WslIPv4Address -Distribution $config.Distribution
    Set-WslPortForward -ListenAddress $config.ListenAddress `
        -ListenPort ([int] $config.ListenPort) -ConnectAddress $wslAddress `
        -ConnectPort ([int] $config.ConnectPort) -ReplaceWithoutPrompt
    Set-PrivateFirewallRule -ListenAddress $config.ListenAddress `
        -ListenPort ([int] $config.ListenPort) | Out-Null

    Write-Host "Refreshed: $($config.ListenAddress):$($config.ListenPort) -> ${wslAddress}:$($config.ConnectPort)"
}

try {
    if (-not (Test-IsAdministrator)) { Restart-Elevated }

    if ($RefreshConfig) {
        Invoke-Refresh -ConfigPath $RefreshConfig
        exit 0
    }

    Write-Host "`nActive local Windows IPv4 addresses" -ForegroundColor Cyan
    Write-Host '-----------------------------------'
    $addresses = @(Get-NetIPAddress -AddressFamily IPv4 -AddressState Preferred |
        Where-Object {
            $_.IPAddress -ne '127.0.0.1' -and
            $_.InterfaceAlias -notmatch '^Loopback'
        } |
        Sort-Object InterfaceAlias, IPAddress)

    if ($addresses.Count -eq 0) { throw 'No active, non-loopback IPv4 addresses were found.' }

    for ($i = 0; $i -lt $addresses.Count; $i++) {
        Write-Host ('{0,2}. {1,-16}  {2}' -f ($i + 1), $addresses[$i].IPAddress, $addresses[$i].InterfaceAlias)
    }
    $addressIndex = Read-ChoiceIndex -Prompt 'Select the Windows listen address' -Maximum $addresses.Count
    $listenAddress = $addresses[$addressIndex].IPAddress

    $distributions = @(Get-WslDistributions)
    if ($distributions.Count -eq 0) { throw 'No WSL distributions are installed.' }

    Write-Host "`nInstalled WSL distributions" -ForegroundColor Cyan
    Write-Host '---------------------------'
    for ($i = 0; $i -lt $distributions.Count; $i++) {
        Write-Host ('{0,2}. {1}' -f ($i + 1), $distributions[$i])
    }
    $distroIndex = Read-ChoiceIndex -Prompt 'Select the WSL distribution' -Maximum $distributions.Count
    $distribution = $distributions[$distroIndex]

    $listenPort = Read-TcpPort -Prompt 'Enter the Windows TCP listen port'
    $connectPort = Read-TcpPort -Prompt 'Enter the WSL TCP destination port' -Default $listenPort
    $wslAddress = Get-WslIPv4Address -Distribution $distribution

    Write-Host "`nPlanned forwarding" -ForegroundColor Cyan
    Write-Host "  Windows: ${listenAddress}:$listenPort"
    Write-Host "  WSL2:    ${wslAddress}:$connectPort ($distribution)"

    Set-WslPortForward -ListenAddress $listenAddress -ListenPort $listenPort `
        -ConnectAddress $wslAddress -ConnectPort $connectPort
    $firewallRule = Set-PrivateFirewallRule -ListenAddress $listenAddress -ListenPort $listenPort

    $taskName = "WSL2 Port Forward $($listenAddress.Replace('.', '-'))-$listenPort"
    if (Read-YesNo -Prompt 'Create an elevated logon task to refresh this rule when the WSL2 IP changes?' -DefaultYes $true) {
        $configDirectory = Join-Path $env:ProgramData 'WSL2-PortForward'
        New-Item -ItemType Directory -Path $configDirectory -Force | Out-Null
        $configPath = Join-Path $configDirectory "$($listenAddress.Replace('.', '-'))-$listenPort.json"

        [pscustomobject]@{
            Distribution  = $distribution
            ListenAddress = $listenAddress
            ListenPort    = $listenPort
            ConnectPort   = $connectPort
        } | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8

        Register-RefreshTask -ConfigPath $configPath -TaskName $taskName
        Write-Host "Scheduled task: $taskName" -ForegroundColor Green
        Write-Host "Configuration:  $configPath"
    }

    Write-Host "`nForwarding configured successfully." -ForegroundColor Green
    Write-Host "Firewall rule: $firewallRule (Private profile only)"
    Write-Host "`nCurrent v4tov4 rules:" -ForegroundColor Cyan
    netsh interface portproxy show v4tov4
    Write-Host "`nReminder: the service in WSL must listen on 0.0.0.0 or its WSL interface address."
}
catch {
    Write-Error $_
    exit 1
}
