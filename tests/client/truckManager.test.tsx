import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '../../src/client/api/client'
import { TruckManager } from '../../src/client/components/admin/TruckManager'
import { ToastProvider } from '../../src/client/components/common/ToastContainer'
import { trucks } from './fixtures'

describe('TruckManager', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders table of existing trucks', () => {
    render(
      <ToastProvider>
        <TruckManager trucks={trucks} onRefresh={vi.fn()} />
      </ToastProvider>,
    )

    expect(screen.getByText('Fahrzeuge verwalten')).toBeInTheDocument()
    expect(screen.getByText('ELF 1')).toBeInTheDocument()
    expect(screen.getByText('HLF 20')).toBeInTheDocument()
    expect(screen.getByText('LF 10')).toBeInTheDocument()
  })

  it('creates a new truck via dialog', async () => {
    const createSpy = vi.spyOn(apiClient, 'createTruck').mockResolvedValue({
      id: 't6',
      name: 'GW-L2',
      seats: 6,
    })
    const onRefresh = vi.fn()

    render(
      <ToastProvider>
        <TruckManager trucks={trucks} onRefresh={onRefresh} />
      </ToastProvider>,
    )

    // Open add dialog
    fireEvent.click(screen.getByRole('button', { name: 'Neues Fahrzeug' }))
    expect(screen.getByText('Neues Fahrzeug anlegen')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/Funkrufname \/ Name/i), {
      target: { value: 'GW-L2' },
    })
    fireEvent.change(screen.getByLabelText(/Sitzplätze/i), {
      target: { value: '6' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith({ name: 'GW-L2', seats: 6 })
      expect(onRefresh).toHaveBeenCalled()
    })
  })

  it('edits an existing truck', async () => {
    const updateSpy = vi.spyOn(apiClient, 'updateTruck').mockResolvedValue({
      id: 't1',
      name: 'ELF 1 (Neu)',
      seats: 3,
    })
    const onRefresh = vi.fn()

    render(
      <ToastProvider>
        <TruckManager trucks={trucks} onRefresh={onRefresh} />
      </ToastProvider>,
    )

    const editButtons = screen.getAllByRole('button', { name: 'Bearbeiten' })
    fireEvent.click(editButtons[0])

    expect(screen.getByText('Fahrzeug bearbeiten')).toBeInTheDocument()
    expect(screen.getByDisplayValue('ELF 1')).toBeInTheDocument()

    fireEvent.change(screen.getByDisplayValue('ELF 1'), {
      target: { value: 'ELF 1 (Neu)' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith('t1', { name: 'ELF 1 (Neu)', seats: 2 })
      expect(onRefresh).toHaveBeenCalled()
    })
  })

  it('deletes a truck after confirmation', async () => {
    const deleteSpy = vi.spyOn(apiClient, 'deleteTruck').mockResolvedValue({ success: true })
    const onRefresh = vi.fn()

    render(
      <ToastProvider>
        <TruckManager trucks={trucks} onRefresh={onRefresh} />
      </ToastProvider>,
    )

    const deleteButtons = screen.getAllByRole('button', { name: 'Löschen' })
    fireEvent.click(deleteButtons[0])

    expect(screen.getByText('Fahrzeug löschen')).toBeInTheDocument()
    expect(
      screen.getByText(/Möchten Sie das Fahrzeug "ELF 1" wirklich löschen\?/),
    ).toBeInTheDocument()

    // Confirm delete
    const confirmDeleteBtn = screen.getByRole('button', { name: 'Löschen', hidden: false })
    fireEvent.click(confirmDeleteBtn)

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith('t1')
      expect(onRefresh).toHaveBeenCalled()
    })
  })
})
