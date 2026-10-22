import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import type { ActiveRosterSummary, Truck } from '../../../shared/types'
import { CREW_SLOTS } from '../../../shared/constants'
import { COLOR_TRUCK_ACTIVE, COLOR_TRUCK_IDLE } from '../../theme'

interface TruckCardProps {
  truck: Truck
  highlighted: boolean
  activeRoster?: ActiveRosterSummary | null
}

export function TruckCard({ truck, highlighted, activeRoster }: TruckCardProps) {
  const slots = CREW_SLOTS[truck.category] ?? []
  const truckAssignments = activeRoster?.assignments[truck.id] ?? {}

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
      {/* Crew slot rows */}
      <Box sx={{ mt: 1.5 }} data-testid="crew-slots">
        {slots.map((role) => {
          const personName = truckAssignments[role] ?? null
          return (
            <Typography
              key={role}
              variant="caption"
              component="div"
              sx={{ opacity: 0.9, lineHeight: 1.8 }}
              data-testid={`crew-slot-${role}`}
            >
              {role}: {personName ?? '-'}
            </Typography>
          )
        })}
      </Box>
    </Paper>
  )
}
