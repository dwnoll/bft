import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { apiClient } from '../../src/client/api/client'
import { RosterManager } from '../../src/client/components/admin/RosterManager'
import { ToastProvider } from '../../src/client/components/common/ToastContainer'
import type { Person, Roster, Truck } from '../../src/shared/types'

const trucks: Truck[] = [
  { id: 'trk-gruppe', name: 'HLF 20', category: 'Gruppe' },
  { id: 'trk-staffel', name: 'ELF 1', category: 'Staffel' },
]

const persons: Person[] = [
  { name: 'Alice', excludedRoles: [] },
  { name: 'Bob', excludedRoles: [] },
]

const rosters: Roster[] = [
  {
    id: 'r1',
    name: 'Schicht A',
    assignments: { 'trk-gruppe': { GF: 'Alice' } },
  },
  {
    id: 'r2',
    name: 'Schicht B',
    assignments: {},
  },
]

describe('RosterManager', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders empty state when no rosters', () => {
    render(
      <ToastProvider>
        <RosterManager
          rosters={[]}
          activeRosterId={null}
          persons={persons}
          trucks={trucks}
          onRefresh={vi.fn()}
        />
      </ToastProvider>,
    )
    expect(screen.getByText('Fahrzeug-Besatzungen')).toBeInTheDocument()
    expect(screen.getByText('Keine Besatzungen vorhanden.')).toBeInTheDocument()
  })

  it('renders table rows for each roster', () => {
    render(
      <ToastProvider>
        <RosterManager
          rosters={rosters}
          activeRosterId={null}
          persons={persons}
          trucks={trucks}
          onRefresh={vi.fn()}
        />
      </ToastProvider>,
    )
    expect(screen.getByText('Schicht A')).toBeInTheDocument()
    expect(screen.getByText('Schicht B')).toBeInTheDocument()
  })

  it('shows "aktiv" chip for the active roster', () => {
    render(
      <ToastProvider>
        <RosterManager
          rosters={rosters}
          activeRosterId="r1"
          persons={persons}
          trucks={trucks}
          onRefresh={vi.fn()}
        />
      </ToastProvider>,
    )
    expect(screen.getByTestId('active-chip')).toBeInTheDocument()
  })

  it('activates a roster when Aktivieren is clicked', async () => {
    const activateSpy = vi.spyOn(apiClient, 'activateRoster').mockResolvedValue({
      rosters,
      activeRosterId: 'r2',
    })
    const onRefresh = vi.fn().mockResolvedValue(undefined)

    render(
      <ToastProvider>
        <RosterManager
          rosters={rosters}
          activeRosterId={null}
          persons={persons}
          trucks={trucks}
          onRefresh={onRefresh}
        />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByTestId('activate-r1'))
    await waitFor(() => {
      expect(activateSpy).toHaveBeenCalledWith('r1')
      expect(onRefresh).toHaveBeenCalled()
    })
  })

  it('deactivates a roster when Deaktivieren is clicked', async () => {
    const deactivateSpy = vi.spyOn(apiClient, 'deactivateRoster').mockResolvedValue({
      rosters,
      activeRosterId: null,
    })
    const onRefresh = vi.fn().mockResolvedValue(undefined)

    render(
      <ToastProvider>
        <RosterManager
          rosters={rosters}
          activeRosterId="r1"
          persons={persons}
          trucks={trucks}
          onRefresh={onRefresh}
        />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByTestId('deactivate-r1'))
    await waitFor(() => {
      expect(deactivateSpy).toHaveBeenCalled()
      expect(onRefresh).toHaveBeenCalled()
    })
  })

  it('opens delete confirm dialog and calls deleteRoster on confirm', async () => {
    const deleteSpy = vi.spyOn(apiClient, 'deleteRoster').mockResolvedValue(undefined)
    const onRefresh = vi.fn().mockResolvedValue(undefined)

    render(
      <ToastProvider>
        <RosterManager
          rosters={rosters}
          activeRosterId={null}
          persons={persons}
          trucks={trucks}
          onRefresh={onRefresh}
        />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByTestId('delete-r1'))
    // Confirm dialog should appear
    const confirmButton = await screen.findByRole('button', { name: 'Löschen' })
    fireEvent.click(confirmButton)

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith('r1')
      expect(onRefresh).toHaveBeenCalled()
    })
  })

  it('opens create dialog when "Neue Besatzung" is clicked', () => {
    render(
      <ToastProvider>
        <RosterManager
          rosters={rosters}
          activeRosterId={null}
          persons={persons}
          trucks={trucks}
          onRefresh={vi.fn()}
        />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Neue Besatzung' }))
    expect(screen.getByText('Neue Besatzung anlegen')).toBeInTheDocument()
  })
})
