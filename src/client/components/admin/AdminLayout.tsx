import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import Container from '@mui/material/Container'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Alert as AlertType, Person, Roster, Settings, Truck } from '../../../shared/types'
import { apiClient } from '../../api/client'
import { useAppState } from '../../hooks/useAppState'
import { COLOR_EMERGENCY } from '../../theme'
import { ConfirmDialog } from '../common/ConfirmDialog'
import { useToast } from '../common/ToastContainer'
import { AlertManager } from './AlertManager'
import { RosterManager } from './RosterManager'
import { SettingsCard } from './SettingsCard'
import { TruckManager } from './TruckManager'

export interface AdminLayoutProps {
  isAuthenticated?: boolean
  onAuthenticatedChange?: (auth: boolean) => void
}

export function AdminLayout({
  isAuthenticated: propIsAuthenticated,
  onAuthenticatedChange,
}: AdminLayoutProps) {
  const { showSuccess, showError } = useToast()

  // Public dashboard state — drives the toggleable false-alarm button (R15).
  const { state: publicState } = useAppState()
  const falseAlarmActive = publicState?.falseAlarmActive === true

  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(
    () => propIsAuthenticated ?? apiClient.isAuthenticated(),
  )

  useEffect(() => {
    if (propIsAuthenticated !== undefined) {
      setIsAuthenticated(propIsAuthenticated)
    }
  }, [propIsAuthenticated])
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [loggingIn, setLoggingIn] = useState(false)

  // Admin Data State
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [alerts, setAlerts] = useState<AlertType[]>([])
  const [settings, setSettings] = useState<Settings>({ soundDurationSec: 60 })
  const [persons, setPersons] = useState<Person[]>([])
  const [rosters, setRosters] = useState<Roster[]>([])
  const [activeRosterId, setActiveRosterId] = useState<string | null>(null)
  // loading is always false (data loading is tracked per-operation via dedicated state).
  // Keeping as a constant to avoid prop-drilling refactor across child components.
  const loading = false
  const [tabIndex, setTabIndex] = useState(0)

  // False Alarm Trigger State
  const [falseAlarmDialogOpen, setFalseAlarmDialogOpen] = useState(false)
  const [triggeringFalseAlarm, setTriggeringFalseAlarm] = useState(false)
  const [cancelingFalseAlarm, setCancelingFalseAlarm] = useState(false)

  // Settings save state
  const [savingSettings, setSavingSettings] = useState(false)

  // Keep the latest onAuthenticatedChange in a ref so loadData never captures a stale prop.
  const onAuthenticatedChangeRef = useRef(onAuthenticatedChange)
  useEffect(() => {
    onAuthenticatedChangeRef.current = onAuthenticatedChange
  }, [onAuthenticatedChange])

  // Guard against concurrent loadData calls: the 2s interval and manual refreshes
  // (handleFalseAlarmConfirm, handleSaveSettings) can overlap on slow networks.
  const loadDataInFlight = useRef(false)

  const loadData = useCallback(async () => {
    if (!apiClient.isAuthenticated() || loadDataInFlight.current) return
    loadDataInFlight.current = true
    try {
      const [fetchedTrucks, fetchedAlerts, fetchedSettings, fetchedPersons, fetchedRosterData] = await Promise.all([
        apiClient.getTrucks(),
        apiClient.getAlerts(),
        apiClient.getSettings(),
        apiClient.getPersons(),
        apiClient.getRosters(),
      ])
      setTrucks(fetchedTrucks)
      setAlerts(fetchedAlerts)
      setSettings(fetchedSettings)
      setPersons(fetchedPersons)
      setRosters(fetchedRosterData.rosters)
      setActiveRosterId(fetchedRosterData.activeRosterId)
    } catch (err) {
      if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 401) {
        setIsAuthenticated(false)
        onAuthenticatedChangeRef.current?.(false)
        apiClient.clearCredentials()
        setAuthError('Sitzung abgelaufen oder ungültige Anmeldedaten')
      }
    } finally {
      loadDataInFlight.current = false
    }
  }, [])

  // Initial load and periodic poll
  useEffect(() => {
    if (isAuthenticated) {
      void loadData()
      const interval = setInterval(() => {
        void loadData()
      }, 2000)
      return () => clearInterval(interval)
    }
  }, [isAuthenticated, loadData])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError(null)
    setLoggingIn(true)
    try {
      apiClient.setCredentials(username, password)
      // Test credentials with an API request
      const [fetchedTrucks, fetchedAlerts, fetchedSettings, fetchedPersons, fetchedRosterData] = await Promise.all([
        apiClient.getTrucks(),
        apiClient.getAlerts(),
        apiClient.getSettings(),
        apiClient.getPersons(),
        apiClient.getRosters(),
      ])
      setTrucks(fetchedTrucks)
      setAlerts(fetchedAlerts)
      setSettings(fetchedSettings)
      setPersons(fetchedPersons)
      setRosters(fetchedRosterData.rosters)
      setActiveRosterId(fetchedRosterData.activeRosterId)
      setIsAuthenticated(true)
      onAuthenticatedChange?.(true)
      showSuccess('Erfolgreich angemeldet')
    } catch (err) {
      apiClient.clearCredentials()
      setIsAuthenticated(false)
      setAuthError('Anmeldung fehlgeschlagen. Bitte Benutzername und Passwort prüfen.')
    } finally {
      setLoggingIn(false)
    }
  }

  const handleFalseAlarmConfirm = async () => {
    setTriggeringFalseAlarm(true)
    try {
      await apiClient.triggerFalseAlert()
      showSuccess('Fehlalarm ausgelöst')
      setFalseAlarmDialogOpen(false)
      await loadData()
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Fehler beim Auslösen des Fehlalarms')
    } finally {
      setTriggeringFalseAlarm(false)
    }
  }

  const handleCancelFalseAlarmConfirm = async () => {
    setCancelingFalseAlarm(true)
    try {
      await apiClient.cancelFalseAlert()
      showSuccess('Fehlalarm abgebrochen')
      setFalseAlarmDialogOpen(false)
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Fehler beim Abbrechen des Fehlalarms')
    } finally {
      setCancelingFalseAlarm(false)
    }
  }

  const handleSaveSettings = async (soundDurationSec: number) => {
    setSavingSettings(true)
    try {
      const updated = await apiClient.updateSettings({ soundDurationSec })
      setSettings(updated)
      showSuccess('Einstellungen gespeichert')
      await loadData()
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Fehler beim Speichern der Einstellungen')
    } finally {
      setSavingSettings(false)
    }
  }

  if (!isAuthenticated) {
    return (
      <Container maxWidth="xs" sx={{ py: 8 }}>
        <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderRadius: 2 }}>
          <CardHeader
            title="Admin-Anmeldung"
            subheader="Bitte Zugangsdaten eingeben"
            titleTypographyProps={{ variant: 'h5', fontWeight: 700, textAlign: 'center' }}
            subheaderTypographyProps={{ textAlign: 'center' }}
          />
          <CardContent>
            {authError && (
              <Alert severity="error" sx={{ mb: 3 }}>
                {authError}
              </Alert>
            )}
            <form onSubmit={handleLogin} noValidate>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                <TextField
                  label="Benutzername"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  fullWidth
                  autoFocus
                />
                <TextField
                  label="Passwort"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  fullWidth
                />
                <Button
                  type="submit"
                  variant="contained"
                  color="primary"
                  size="large"
                  disabled={loggingIn || !username || !password}
                  fullWidth
                  sx={{ mt: 1, py: 1.5, fontWeight: 700 }}
                >
                  {loggingIn ? 'Wird angemeldet...' : 'Anmelden'}
                </Button>
              </Box>
            </form>
          </CardContent>
        </Card>
      </Container>
    )
  }

  return (
    <Container maxWidth="xl" component="main" sx={{ py: { xs: 2, md: 4 } }}>
      {/* Top Action Bar */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 2,
          mb: 3,
        }}
      >
        <Box>
          <Typography component="h1" variant="h4" sx={{ fontWeight: 700 }}>
            Verwaltung
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Steuerung von Alarmen, Einsatzübungen und Fahrzeugen
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          {falseAlarmActive ? (
            <Button
              variant="outlined"
              color="warning"
              onClick={() => setFalseAlarmDialogOpen(true)}
              sx={{ fontWeight: 700 }}
            >
              Fehlalarm abbrechen
            </Button>
          ) : (
            <Button
              variant="contained"
              color="error"
              onClick={() => setFalseAlarmDialogOpen(true)}
              sx={{
                fontWeight: 700,
                bgcolor: COLOR_EMERGENCY,
                '&:hover': { bgcolor: '#b71c1c' },
              }}
            >
              Fehlalarm auslösen
            </Button>
          )}
        </Box>
      </Box>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs
          value={tabIndex}
          onChange={(_e, v: number) => setTabIndex(v)}
          textColor="primary"
          indicatorColor="primary"
          aria-label="Admin Abschnitte"
        >
          <Tab label="Alarme & Übungen" sx={{ fontWeight: 600 }} />
          <Tab label="Fahrzeuge" sx={{ fontWeight: 600 }} />
          <Tab label="Besatzung" sx={{ fontWeight: 600 }} />
        </Tabs>
      </Box>

      {/* Tab Panels */}
      {tabIndex === 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <AlertManager
            alerts={alerts}
            trucks={trucks}
            onRefresh={loadData}
            loading={loading}
          />
          <SettingsCard
            initialDurationSec={settings.soundDurationSec}
            onSave={handleSaveSettings}
            loading={savingSettings}
          />
        </Box>
      )}

      {tabIndex === 1 && (
        <TruckManager trucks={trucks} onRefresh={loadData} loading={loading} />
      )}

      {tabIndex === 2 && (
        <RosterManager
          rosters={rosters}
          activeRosterId={activeRosterId}
          persons={persons}
          trucks={trucks}
          onRefresh={loadData}
        />
      )}

      {/* False Alarm Trigger / Cancel Dialog */}
      <ConfirmDialog
        open={falseAlarmDialogOpen}
        title={falseAlarmActive ? 'Fehlalarm abbrechen' : 'Fehlalarm auslösen'}
        message={
          falseAlarmActive
            ? 'Möchten Sie den aktiven Fehlalarm abbrechen? Der Einsatzmonitor kehrt daraufhin in den Bereitschaftszustand zurück.'
            : 'Möchten Sie sofort einen Fehlalarm auslösen? Dies aktiviert den Alarmton und schaltet den Einsatzmonitor für 10 Minuten auf Fehlalarm.'
        }
        confirmText={falseAlarmActive ? 'Fehlalarm abbrechen' : 'Fehlalarm auslösen'}
        cancelText="Abbrechen"
        confirmColor={falseAlarmActive ? 'warning' : 'error'}
        onConfirm={falseAlarmActive ? handleCancelFalseAlarmConfirm : handleFalseAlarmConfirm}
        onCancel={() => setFalseAlarmDialogOpen(false)}
        loading={falseAlarmActive ? cancelingFalseAlarm : triggeringFalseAlarm}
      />
    </Container>
  )
}
