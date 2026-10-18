import VolumeOffIcon from '@mui/icons-material/VolumeOff'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import Button from '@mui/material/Button'

interface SoundToggleProps {
  enabled: boolean
  onChange: (enabled: boolean) => void
}

/** Persistent per-device "Ton" toggle (R18). The click also unlocks browser audio. */
export function SoundToggle({ enabled, onChange }: SoundToggleProps) {
  return (
    <Button
      variant={enabled ? 'contained' : 'outlined'}
      color={enabled ? 'success' : 'inherit'}
      aria-pressed={enabled}
      startIcon={enabled ? <VolumeUpIcon /> : <VolumeOffIcon />}
      onClick={() => onChange(!enabled)}
    >
      Ton {enabled ? 'an' : 'aus'}
    </Button>
  )
}
