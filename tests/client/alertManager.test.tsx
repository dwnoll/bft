import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '../../src/client/api/client'
import { AlertManager } from '../../src/client/components/admin/AlertManager'
import { ToastProvider } from '../../src/client/components/common/ToastContainer'
import type { Alert } from '../../src/shared/types'
import { trucks } from './fixtures'

describe('AlertManager', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders empty state when no alerts are present (R9d)', () => {
    render(
      <ToastProvider>
        <AlertManager alerts={[]} trucks={trucks} onRefresh={vi.fn()} />
      </ToastProvider>,
    )

    expect(
      screen.getByText('Keine ausstehenden Alarme — neuen Alarm anlegen?'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Jetzt Alarm anlegen' })).toBeInTheDocument()
  })

  it('renders alerts with different statuses and action buttons', () => {
    const alerts: Alert[] = [
      {
        id: 'a1',
        name: 'Einsatz Brand',
        category: 'Wohnungsbrand',
        address: 'Musterstr. 5',
        info: 'Rauch',
        truckIds: ['t1'],
        status: 'pending',
      },
      {
        id: 'a2',
        name: 'THL B3',
        category: 'Hilfeleistung',
        address: 'B3 km 12',
        info: 'Pannenfahrzeug',
        truckIds: ['t2'],
        status: 'active',
        activeSince: Date.now() - 5000,
      },
      {
        id: 'a3',
        name: 'Ölspur Einsatz',
        category: 'Ölspur',
        address: 'Dorfstr. 1',
        info: 'Öl auf Fahrbahn',
        truckIds: [],
        status: 'pending',
        triggerAt: Date.now() + 180000, // armed countdown
      },
    ]

    render(
      <ToastProvider>
        <AlertManager alerts={alerts} trucks={trucks} onRefresh={vi.fn()} />
      </ToastProvider>,
    )

    expect(screen.getByText('Einsatz Brand')).toBeInTheDocument()
    expect(screen.getByText('THL B3')).toBeInTheDocument()
    expect(screen.getByText('Ölspur Einsatz')).toBeInTheDocument()

    // a1 is pending -> Auslösen button
    expect(screen.getByRole('button', { name: 'Auslösen' })).toBeInTheDocument()

    // a2 is active -> Abschließen button
    expect(screen.getByRole('button', { name: 'Abschließen' })).toBeInTheDocument()

    // a3 is armed -> Abbrechen button
    expect(screen.getByRole('button', { name: 'Abbrechen' })).toBeInTheDocument()
  })

  it('triggers alert via trigger dialog', async () => {
    const triggerSpy = vi.spyOn(apiClient, 'triggerAlert').mockResolvedValue({
      id: 'a1',
      name: 'Wohnungsbrand',
      category: 'Wohnungsbrand',
      address: 'Musterstr. 5',
      info: 'Rauch',
      truckIds: ['t1'],
      status: 'pending',
      triggerAt: Date.now() + 300000,
    })
    const onRefresh = vi.fn()

    const alerts: Alert[] = [
      {
        id: 'a1',
        name: 'Wohnungsbrand',
        category: 'Wohnungsbrand',
        address: 'Musterstr. 5',
        info: 'Rauch',
        truckIds: ['t1'],
        status: 'pending',
      },
    ]

    render(
      <ToastProvider>
        <AlertManager alerts={alerts} trucks={trucks} onRefresh={onRefresh} />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Auslösen' }))
    expect(screen.getByText('Alarm verzögert auslösen')).toBeInTheDocument()

    // Click confirm trigger
    const confirmTriggerBtn = screen.getByRole('button', { name: /Auslösen \(3 min\)/i })
    fireEvent.click(confirmTriggerBtn)

    await waitFor(() => {
      expect(triggerSpy).toHaveBeenCalledWith('a1', 3)
      expect(onRefresh).toHaveBeenCalled()
    })
  })

  it('cancels armed trigger', async () => {
    const cancelSpy = vi.spyOn(apiClient, 'cancelTrigger').mockResolvedValue({
      id: 'a3',
      name: 'Ölspur',
      category: 'Ölspur',
      address: 'Dorfstr. 1',
      info: 'Öl',
      truckIds: [],
      status: 'pending',
    })
    const onRefresh = vi.fn()

    const alerts: Alert[] = [
      {
        id: 'a3',
        name: 'Ölspur',
        category: 'Ölspur',
        address: 'Dorfstr. 1',
        info: 'Öl',
        truckIds: [],
        status: 'pending',
        triggerAt: Date.now() + 180000,
      },
    ]

    render(
      <ToastProvider>
        <AlertManager alerts={alerts} trucks={trucks} onRefresh={onRefresh} />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))

    await waitFor(() => {
      expect(cancelSpy).toHaveBeenCalledWith('a3')
      expect(onRefresh).toHaveBeenCalled()
    })
  })

  it('completes active alert', async () => {
    const completeSpy = vi.spyOn(apiClient, 'completeAlert').mockResolvedValue({
      id: 'a2',
      name: 'THL B3',
      category: 'Hilfeleistung',
      address: 'B3 km 12',
      info: 'Pannenfahrzeug',
      truckIds: ['t2'],
      status: 'complete',
      completedAt: Date.now(),
    })
    const onRefresh = vi.fn()

    const alerts: Alert[] = [
      {
        id: 'a2',
        name: 'THL B3',
        category: 'Hilfeleistung',
        address: 'B3 km 12',
        info: 'Pannenfahrzeug',
        truckIds: ['t2'],
        status: 'active',
        activeSince: Date.now() - 5000,
      },
    ]

    render(
      <ToastProvider>
        <AlertManager alerts={alerts} trucks={trucks} onRefresh={onRefresh} />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Abschließen' }))

    await waitFor(() => {
      expect(completeSpy).toHaveBeenCalledWith('a2')
      expect(onRefresh).toHaveBeenCalled()
    })
  })

  it('handles trigger rejection with error toast (AE1, R10)', async () => {
    vi.spyOn(apiClient, 'triggerAlert').mockRejectedValue(
      new Error('Alarm aktiv oder ausstehend'),
    )

    const alerts: Alert[] = [
      {
        id: 'a1',
        name: 'Wohnungsbrand',
        category: 'Wohnungsbrand',
        address: 'Musterstr. 5',
        info: 'Rauch',
        truckIds: ['t1'],
        status: 'pending',
      },
    ]

    render(
      <ToastProvider>
        <AlertManager alerts={alerts} trucks={trucks} onRefresh={vi.fn()} />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Auslösen' }))
    const confirmTriggerBtn = screen.getByRole('button', { name: /Auslösen \(3 min\)/i })
    fireEvent.click(confirmTriggerBtn)

    await waitFor(() => {
      expect(screen.getByText('Alarm aktiv oder ausstehend')).toBeInTheDocument()
    })
  })
})
