import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import TextField from '@mui/material/TextField'
import { useEffect, useState } from 'react'

export interface SettingsCardProps {
  initialDurationSec: number
  onSave: (durationSec: number) => Promise<void> | void
  loading?: boolean
}

export function SettingsCard({
  initialDurationSec,
  onSave,
  loading = false,
}: SettingsCardProps) {
  const [duration, setDuration] = useState<number>(initialDurationSec)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDuration(initialDurationSec)
  }, [initialDurationSec])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isNaN(duration) || duration <= 0) {
      setError('Bitte eine gültige Dauer in Sekunden (mindestens 1) eingeben')
      return
    }
    setError(null)
    await onSave(Math.round(duration))
  }

  return (
    <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderRadius: 2 }}>
      <CardHeader
        title="Einstellungen"
        subheader="Konfiguration von Alarmton und Systemparametern"
        titleTypographyProps={{ variant: 'h6', fontWeight: 700 }}
      />
      <CardContent>
        <form onSubmit={handleSubmit}>
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2, alignItems: { sm: 'flex-start' } }}>
            <TextField
              label="Dauer Warnton (Sekunden)"
              type="number"
              value={duration}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10)
                setDuration(isNaN(val) ? 0 : val)
                setError(null)
              }}
              error={Boolean(error)}
              helperText={error || 'Standard: 60 Sekunden. Ton wird während dieser Zeit in Schleife abgespielt.'}
              inputProps={{ min: 1, step: 1 }}
              disabled={loading}
              sx={{ minWidth: 260 }}
            />
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={loading || duration <= 0}
              sx={{ height: 56, px: 3 }}
            >
              Speichern
            </Button>
          </Box>
        </form>
      </CardContent>
    </Card>
  )
}
