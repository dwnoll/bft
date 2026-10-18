import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import Slider from '@mui/material/Slider'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { MAX_DELAY_MINUTES, MIN_DELAY_MINUTES } from '../../../shared/constants'

export interface TriggerDialogProps {
  open: boolean
  alertName?: string
  onClose: () => void
  onConfirm: (delayMinutes: number) => void
  loading?: boolean
}

const marks = [
  { value: 3, label: '3 min' },
  { value: 5, label: '5 min' },
  { value: 10, label: '10 min' },
  { value: 15, label: '15 min' },
]

export function TriggerDialog({
  open,
  alertName,
  onClose,
  onConfirm,
  loading = false,
}: TriggerDialogProps) {
  const [delay, setDelay] = useState<number>(MIN_DELAY_MINUTES)

  const handleOpen = () => {
    setDelay(MIN_DELAY_MINUTES)
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      TransitionProps={{ onEnter: handleOpen }}
    >
      <DialogTitle>Alarm verzögert auslösen</DialogTitle>
      <DialogContent>
        {alertName && (
          <DialogContentText sx={{ mb: 2 }}>
            Ausgewählter Alarm: <strong>{alertName}</strong>
          </DialogContentText>
        )}
        <DialogContentText sx={{ mb: 3 }}>
          Wählen Sie die Verzögerung bis zur Aktivierung des Alarms (3 bis 15 Minuten):
        </DialogContentText>

        <Box sx={{ px: 2, py: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Verzögerung:
            </Typography>
            <Typography variant="h6" color="primary" sx={{ fontWeight: 700 }}>
              {delay} {delay === 1 ? 'Minute' : 'Minuten'}
            </Typography>
          </Box>

          <Slider
            value={delay}
            min={MIN_DELAY_MINUTES}
            max={MAX_DELAY_MINUTES}
            step={1}
            marks={marks}
            valueLabelDisplay="auto"
            onChange={(_e, val) => setDelay(val as number)}
            disabled={loading}
            aria-label="Verzögerung in Minuten"
          />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={loading} color="inherit">
          Abbrechen
        </Button>
        <Button
          onClick={() => onConfirm(delay)}
          disabled={loading}
          variant="contained"
          color="warning"
        >
          Auslösen ({delay} min)
        </Button>
      </DialogActions>
    </Dialog>
  )
}
