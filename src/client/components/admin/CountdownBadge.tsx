import Chip from '@mui/material/Chip'
import { useEffect, useState } from 'react'
import { COLOR_WARNING } from '../../theme'

export interface CountdownBadgeProps {
  triggerAt: number
  onExpire?: () => void
}

function formatRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSec / 60)
  const seconds = totalSec % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function CountdownBadge({ triggerAt, onExpire }: CountdownBadgeProps) {
  const [remainingMs, setRemainingMs] = useState<number>(() => Math.max(0, triggerAt - Date.now()))

  useEffect(() => {
    const update = () => {
      const rem = Math.max(0, triggerAt - Date.now())
      setRemainingMs(rem)
      if (rem === 0 && onExpire) {
        onExpire()
      }
    }

    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [triggerAt, onExpire])

  const label = `ausstehend (${formatRemaining(remainingMs)})`

  return (
    <Chip
      label={label}
      size="small"
      sx={{
        bgcolor: COLOR_WARNING,
        color: '#ffffff',
        fontWeight: 600,
        letterSpacing: 0.3,
      }}
    />
  )
}
