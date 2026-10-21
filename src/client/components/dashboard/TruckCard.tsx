import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import type { Truck } from '../../../shared/types'
import { COLOR_TRUCK_ACTIVE, COLOR_TRUCK_IDLE } from '../../theme'

interface TruckCardProps {
  truck: Truck
  highlighted: boolean
}

export function TruckCard({ truck, highlighted }: TruckCardProps) {
  return (
    <Paper
      elevation={highlighted ? 8 : 1}
      data-testid="truck-card"
      data-highlighted={highlighted}
      sx={{
        p: { xs: 2, md: 3 },
        width: '100%',
        bgcolor: highlighted ? COLOR_TRUCK_ACTIVE : COLOR_TRUCK_IDLE,
        color: '#ffffff',
        border: '2px solid',
        borderColor: highlighted ? '#ffffff' : 'rgba(255,255,255,0.12)',
      }}
    >
      <Typography component="h3" variant="h4">
        {truck.name}
      </Typography>
      <Typography variant="body1" sx={{ opacity: 0.85 }}>
        {truck.category}
      </Typography>
      {highlighted && (
        <Chip
          label="Alarmiert"
          sx={{ mt: 1, bgcolor: '#ffffff', color: COLOR_TRUCK_ACTIVE, fontWeight: 700 }}
        />
      )}
    </Paper>
  )
}
