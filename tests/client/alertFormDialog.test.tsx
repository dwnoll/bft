import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AlertFormDialog } from '../../src/client/components/admin/AlertFormDialog'
import { trucks } from './fixtures'

describe('AlertFormDialog', () => {
  it('renders blank form in create mode and validates required fields', () => {
    const onSubmit = vi.fn()
    render(
      <AlertFormDialog
        open={true}
        availableTrucks={trucks}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    )

    expect(screen.getByText('Neuen Alarm anlegen')).toBeInTheDocument()

    // Click submit with empty fields
    const submitBtn = screen.getByRole('button', { name: 'Alarm anlegen' })
    fireEvent.click(submitBtn)

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Bezeichnung ist erforderlich')).toBeInTheDocument()
    expect(screen.getByText('Stichwort ist erforderlich')).toBeInTheDocument()
    expect(screen.getByText('Adresse ist erforderlich')).toBeInTheDocument()
    expect(screen.getByText('Zusatzinfo ist erforderlich')).toBeInTheDocument()
  })

  it('submits valid alert payload', () => {
    const onSubmit = vi.fn()
    render(
      <AlertFormDialog
        open={true}
        availableTrucks={trucks}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    )

    fireEvent.change(screen.getByLabelText(/Bezeichnung \/ Name/i), {
      target: { value: 'B3 Kellerbrand' },
    })
    fireEvent.change(screen.getByLabelText(/Stichwort \/ Kategorie/i), {
      target: { value: 'Kellerbrand' },
    })
    fireEvent.change(screen.getByLabelText(/Einsatzort \/ Adresse/i), {
      target: { value: 'Bahnhofstr. 12' },
    })
    fireEvent.change(screen.getByLabelText(/Zusatzinfo/i), {
      target: { value: 'Starke Rauchentwicklung' },
    })
    fireEvent.change(screen.getByLabelText(/Notizen/i), {
      target: { value: 'Zugang über Hof' },
    })

    const submitBtn = screen.getByRole('button', { name: 'Alarm anlegen' })
    fireEvent.click(submitBtn)

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'B3 Kellerbrand',
      category: 'Kellerbrand',
      address: 'Bahnhofstr. 12',
      info: 'Starke Rauchentwicklung',
      notes: 'Zugang über Hof',
      truckIds: [],
    })
  })

  it('populates fields when initialData is provided for edit', () => {
    const onSubmit = vi.fn()
    const initialAlert = {
      id: 'a1',
      name: 'Einsatz Brand 1',
      category: 'Wohnungsbrand',
      address: 'Musterstraße 5',
      info: 'Brandgeruch',
      notes: 'Schlüssel da',
      truckIds: ['t1', 't2'],
      status: 'pending' as const,
    }

    render(
      <AlertFormDialog
        open={true}
        initialData={initialAlert}
        availableTrucks={trucks}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    )

    expect(screen.getByText('Alarm bearbeiten')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Einsatz Brand 1')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Wohnungsbrand')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Musterstraße 5')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Brandgeruch')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Schlüssel da')).toBeInTheDocument()

    const submitBtn = screen.getByRole('button', { name: 'Änderungen speichern' })
    fireEvent.click(submitBtn)

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Einsatz Brand 1',
      category: 'Wohnungsbrand',
      address: 'Musterstraße 5',
      info: 'Brandgeruch',
      notes: 'Schlüssel da',
      truckIds: ['t1', 't2'],
    })
  })
})
