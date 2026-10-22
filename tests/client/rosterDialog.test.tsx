import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { apiClient } from '../../src/client/api/client'
import { RosterDialog } from '../../src/client/components/admin/RosterDialog'
import { ToastProvider } from '../../src/client/components/common/ToastContainer'
import type { Person, Roster, Truck } from '../../src/shared/types'

const trucks: Truck[] = [
  { id: 'trk-gruppe', name: 'HLF 20', category: 'Gruppe' },
]

const persons: Person[] = [
  { name: 'Alice', excludedRoles: [] },
  { name: 'Bob', excludedRoles: ['GF'] },
]

const existingRoster: Roster = {
  id: 'r1',
  name: 'Schicht A',
  assignments: { 'trk-gruppe': { GF: 'Alice' } },
}

describe('RosterDialog — create mode', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders create dialog with empty name field', () => {
    render(
      <ToastProvider>
        <RosterDialog
          open
          roster={null}
          persons={persons}
          trucks={trucks}
          onClose={vi.fn()}
        />
      </ToastProvider>,
    )
    expect(screen.getByText('Neue Besatzung anlegen')).toBeInTheDocument()
    expect((screen.getByTestId('roster-name-input') as HTMLInputElement).value).toBe('')
  })

  it('saves a new roster via createRoster', async () => {
    const createSpy = vi.spyOn(apiClient, 'createRoster').mockResolvedValue({
      id: 'new-r',
      name: 'My Roster',
      assignments: {},
    })
    const onClose = vi.fn()

    render(
      <ToastProvider>
        <RosterDialog
          open
          roster={null}
          persons={persons}
          trucks={trucks}
          onClose={onClose}
        />
      </ToastProvider>,
    )

    fireEvent.change(screen.getByTestId('roster-name-input'), {
      target: { value: 'My Roster' },
    })

    fireEvent.click(screen.getByTestId('save-roster-button'))

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalled()
      expect(onClose).toHaveBeenCalledWith(true)
    })
  })

  it('save button is disabled when name is empty', () => {
    render(
      <ToastProvider>
        <RosterDialog
          open
          roster={null}
          persons={persons}
          trucks={trucks}
          onClose={vi.fn()}
        />
      </ToastProvider>,
    )
    expect(screen.getByTestId('save-roster-button')).toBeDisabled()
  })

  it('shows all persons in the unassigned pool', () => {
    render(
      <ToastProvider>
        <RosterDialog
          open
          roster={null}
          persons={persons}
          trucks={trucks}
          onClose={vi.fn()}
        />
      </ToastProvider>,
    )
    expect(screen.getByTestId('pool-person-Alice')).toBeInTheDocument()
    expect(screen.getByTestId('pool-person-Bob')).toBeInTheDocument()
  })

  it('calls onClose(false) on Abbrechen', () => {
    const onClose = vi.fn()
    render(
      <ToastProvider>
        <RosterDialog
          open
          roster={null}
          persons={persons}
          trucks={trucks}
          onClose={onClose}
        />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    expect(onClose).toHaveBeenCalledWith(false)
  })
})

describe('RosterDialog — edit mode', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders edit dialog with pre-filled name', () => {
    render(
      <ToastProvider>
        <RosterDialog
          open
          roster={existingRoster}
          persons={persons}
          trucks={trucks}
          onClose={vi.fn()}
        />
      </ToastProvider>,
    )
    expect(screen.getByText('Besatzung bearbeiten')).toBeInTheDocument()
    expect((screen.getByTestId('roster-name-input') as HTMLInputElement).value).toBe('Schicht A')
  })

  it('shows assigned person in the slot and not in the pool', () => {
    render(
      <ToastProvider>
        <RosterDialog
          open
          roster={existingRoster}
          persons={persons}
          trucks={trucks}
          onClose={vi.fn()}
        />
      </ToastProvider>,
    )
    // Alice should appear in the slot for trk-gruppe/GF
    expect(screen.getByTestId('slot-trk-gruppe-GF')).toBeInTheDocument()
    // Alice should NOT be in the pool
    expect(screen.queryByTestId('pool-person-Alice')).not.toBeInTheDocument()
    // Bob should be in the pool
    expect(screen.getByTestId('pool-person-Bob')).toBeInTheDocument()
  })

  it('saves via updateRoster on Speichern', async () => {
    const updateSpy = vi.spyOn(apiClient, 'updateRoster').mockResolvedValue({
      ...existingRoster,
      name: 'Updated',
    })
    const onClose = vi.fn()

    render(
      <ToastProvider>
        <RosterDialog
          open
          roster={existingRoster}
          persons={persons}
          trucks={trucks}
          onClose={onClose}
        />
      </ToastProvider>,
    )

    fireEvent.change(screen.getByTestId('roster-name-input'), {
      target: { value: 'Updated' },
    })
    fireEvent.click(screen.getByTestId('save-roster-button'))

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith('r1', expect.objectContaining({ name: 'Updated' }))
      expect(onClose).toHaveBeenCalledWith(true)
    })
  })

  it('shows random-assign confirm dialog in edit mode', () => {
    render(
      <ToastProvider>
        <RosterDialog
          open
          roster={existingRoster}
          persons={persons}
          trucks={trucks}
          onClose={vi.fn()}
        />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByTestId('random-assign-button'))
    // Confirm dialog should appear (not the initial click in edit mode)
    expect(screen.getByText('Bestehende Zuweisungen werden ersetzt. Fortsetzen?')).toBeInTheDocument()
  })

  it('performs random assign after confirm in edit mode', async () => {
    const randomSpy = vi.spyOn(apiClient, 'randomAssignRoster').mockResolvedValue({
      roster: { ...existingRoster, assignments: {} },
      assigned: 1,
      unassigned: [],
    })

    render(
      <ToastProvider>
        <RosterDialog
          open
          roster={existingRoster}
          persons={persons}
          trucks={trucks}
          onClose={vi.fn()}
        />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByTestId('random-assign-button'))
    // Confirm
    const confirmButton = await screen.findByRole('button', { name: 'Fortsetzen' })
    fireEvent.click(confirmButton)

    await waitFor(() => {
      expect(randomSpy).toHaveBeenCalledWith('r1')
    })
  })
})
