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

  const midCount = Math.ceil(slots.length / 2)
  const middleSlots = slots.slice(0, midCount)
  const rightSlots = slots.slice(midCount)

  const renderSlots = (roles: string[]) =>
    roles.map((role) => {
      const personName = truckAssignments[role] ?? null
      return (
        <Typography
          key={role}
          variant="caption"
          component="div"
          sx={{ opacity: 0.9, lineHeight: 1.8 }}
          data-testid={`crew-slot-${role}`}
        >
          <Box
            component="span"
            sx={{ fontWeight: 700, display: 'inline-block', width: '3ch', textAlign: 'left' }}
          >
            {role}
          </Box>
          : {personName ?? '-'}
        </Typography>
      )
    })

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
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          gap: { xs: 1.5, sm: 3 },
          alignItems: { sm: 'flex-start' },
        }}
      >
        {/* Left column: identity + status chip */}
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
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
        </Box>

        {/* Middle column: first half of crew slots */}
        <Box>{renderSlots(middleSlots)}</Box>

        {/* Right column: second half of crew slots */}
        <Box>{renderSlots(rightSlots)}</Box>
      </Box>
    </Paper>
  )
}
