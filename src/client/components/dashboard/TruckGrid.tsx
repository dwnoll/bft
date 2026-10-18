import Grid from '@mui/material/Grid'
import type { Truck } from '../../../shared/types'
import { TruckCard } from './TruckCard'

interface TruckGridProps {
  trucks: Truck[]
  highlightedIds: ReadonlySet<string>
}

export function TruckGrid({ trucks, highlightedIds }: TruckGridProps) {
  return (
    <Grid
      container
      spacing={{ xs: 1.5, md: 3 }}
      component="ul"
      aria-label="Fahrzeuge"
      sx={{ listStyle: 'none', m: 0, p: 0 }}
    >
      {trucks.map((truck) => (
        <Grid item xs={12} sm={6} md={4} key={truck.id} component="li" sx={{ display: 'flex' }}>
          <TruckCard truck={truck} highlighted={highlightedIds.has(truck.id)} />
        </Grid>
      ))}
    </Grid>
  )
}
