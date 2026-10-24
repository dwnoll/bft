import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { useMemo } from 'react'
import type { PublicState } from '../../../shared/types'
import { useAlarmSound } from '../../hooks/useAlarmSound'
import { useAppState } from '../../hooks/useAppState'
import { COLOR_EMERGENCY } from '../../theme'
import { LocationPanel } from '../common/LocationPanel'
import { SoundToggle } from './SoundToggle'
import { TruckGrid } from './TruckGrid'

const FALSE_ALARM_SOUND_KEY = 'false-alarm'

function describeState(state: PublicState | null): string {
  if (!state) return ''
  const { activeAlert, falseAlarmActive, trucks } = state
  if (activeAlert) {
    const names = trucks
      .filter((t) => activeAlert.truckIds.includes(t.id))
      .map((t) => t.name)
      .join(', ')
    let msg = `Alarm: ${activeAlert.category}, ${activeAlert.address}. Fahrzeuge: ${names || 'keine'}.`
    if (activeAlert.lat != null && activeAlert.lng != null) {
      msg += ` Position: ${activeAlert.lat.toFixed(3)}, ${activeAlert.lng.toFixed(3)}.`
    }
    return msg
  }
  if (falseAlarmActive) return 'Fehlalarm.'
  return 'Kein aktiver Alarm.'
}

/** Public station dashboard "Einsatzmonitor" (R19, R20). */
export function Dashboard() {
  const { state, error } = useAppState()

  const activeAlert = state?.activeAlert ?? null
  const falseAlarm = state?.falseAlarmActive === true
  const soundKey = activeAlert ? activeAlert.id : falseAlarm ? FALSE_ALARM_SOUND_KEY : null
  const { enabled, setEnabled } = useAlarmSound(soundKey, state?.settings.soundDurationSec ?? 60)

  const highlightedIds = useMemo(
    () => new Set(activeAlert?.truckIds ?? []),
    [activeAlert],
  )
  const announcement = describeState(state)

  return (
    <Container maxWidth="xl" component="main" sx={{ py: { xs: 2, md: 4 } }}>
      {/* Always mounted so screen readers announce every change (R1a). */}
      <Box role="status" aria-live="polite" aria-atomic="true" sx={visuallyHidden}>
        {announcement}
      </Box>

      {error && !state && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Keine Verbindung zum Server – es wird erneut versucht.
        </Alert>
      )}
      {error && state && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Verbindung unterbrochen – angezeigt wird der letzte bekannte Stand.
        </Alert>
      )}

      {state && (
        <>
          {activeAlert ? (
            <Paper
              component="section"
              aria-label="Aktiver Alarm"
              sx={{ bgcolor: COLOR_EMERGENCY, color: '#ffffff', p: { xs: 1, md: 1.5 }, mb: 3 }}
            >
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: { xs: 'column', md: 'row' },
                  gap: 3,
                }}
              >
                <Box sx={{ flex: { xs: 'none', md: 1 } }}>
                  <Typography component="h1" variant="h2">
                    {activeAlert.category}
                  </Typography>
                  <Typography variant="h3" component="p" sx={{ mt: 1 }}>
                    {activeAlert.address}
                  </Typography>
                  <Typography variant="h5" component="p" sx={{ mt: 1 }}>
                    {activeAlert.info}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', flex: { xs: 'none', md: 1 } }}>
                  <LocationPanel
                    address={activeAlert.address}
                    lat={activeAlert.lat}
                    lng={activeAlert.lng}
                    zoom={activeAlert.zoom}
                    stretch
                    centered
                  />
                </Box>
              </Box>
            </Paper>
          ) : falseAlarm ? (
            <Paper
              component="section"
              sx={{ bgcolor: COLOR_EMERGENCY, color: '#ffffff', p: { xs: 2, md: 4 }, mb: 3 }}
            >
              <Typography component="h1" variant="h2">
                Fehlalarm
              </Typography>
            </Paper>
          ) : (
            <Box component="section" sx={{ mb: 3, textAlign: 'center' }}>
              <Typography component="h1" variant="h2">
                Einsatzmonitor
              </Typography>
            </Box>
          )}

          <TruckGrid trucks={state.trucks} highlightedIds={highlightedIds} activeRoster={state.activeRoster} />
        </>
      )}

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
        <SoundToggle enabled={enabled} onChange={setEnabled} />
      </Box>
    </Container>
  )
}

const visuallyHidden = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const
