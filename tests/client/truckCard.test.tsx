import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { TruckCard } from '../../src/client/components/dashboard/TruckCard'
import type { ActiveRosterSummary, Truck } from '../../src/shared/types'

const gruppeTruck: Truck = { id: 'trk-g', name: 'HLF 20', category: 'Gruppe' }
const staffelTruck: Truck = { id: 'trk-s', name: 'ELF 1', category: 'Staffel' }
const truppTruck: Truck = { id: 'trk-t', name: 'LF 10', category: 'Trupp' }

describe('TruckCard — crew slot rendering', () => {
  it('shows all Gruppe slots with "-" when no active roster', () => {
    render(<TruckCard truck={gruppeTruck} highlighted={false} activeRoster={null} />)
    // Gruppe slots: GF MA ME AF AM WF WM SF SM
    const slots = screen.getAllByTestId(/^crew-slot-/)
    expect(slots).toHaveLength(9)
    slots.forEach((slot) => expect(slot.textContent).toMatch(/:  -$/))
  })

  it('shows all Staffel slots (6 slots)', () => {
    render(<TruckCard truck={staffelTruck} highlighted={false} />)
    const slots = screen.getAllByTestId(/^crew-slot-/)
    expect(slots).toHaveLength(6)
  })

  it('shows all Trupp slots (3 slots)', () => {
    render(<TruckCard truck={truppTruck} highlighted={false} />)
    const slots = screen.getAllByTestId(/^crew-slot-/)
    expect(slots).toHaveLength(3)
  })

  it('renders assigned person name in the slot', () => {
    const activeRoster: ActiveRosterSummary = {
      name: 'Test Roster',
      assignments: {
        'trk-g': { GF: 'Berger Anna', MA: null },
      },
    }
    render(<TruckCard truck={gruppeTruck} highlighted={false} activeRoster={activeRoster} />)
    const gfSlot = screen.getByTestId('crew-slot-GF')
    expect(gfSlot.textContent).toBe('GF:  Berger Anna')
    const maSlot = screen.getByTestId('crew-slot-MA')
    expect(maSlot.textContent).toBe('MA:  -')
  })

  it('renders "-" for all slots of an unassigned truck even with an active roster', () => {
    const activeRoster: ActiveRosterSummary = {
      name: 'Other Roster',
      assignments: {
        'other-truck': { GF:  'Someone' },
      },
    }
    render(<TruckCard truck={gruppeTruck} highlighted={false} activeRoster={activeRoster} />)
    const slots = screen.getAllByTestId(/^crew-slot-/)
    slots.forEach((slot) => expect(slot.textContent).toMatch(/:  -$/))
  })

  it('renders "Alarmiert" chip only when highlighted', () => {
    const { rerender } = render(<TruckCard truck={gruppeTruck} highlighted={false} />)
    expect(screen.queryByText('Alarmiert')).not.toBeInTheDocument()
    rerender(<TruckCard truck={gruppeTruck} highlighted={true} />)
    expect(screen.getByText('Alarmiert')).toBeInTheDocument()
  })
})
