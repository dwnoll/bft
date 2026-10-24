import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiClient } from '../../src/client/api/client'
import { AdminLayout } from '../../src/client/components/admin/AdminLayout'
import { ToastProvider } from '../../src/client/components/common/ToastContainer'
import { makeState, mockFetchState, trucks } from './fixtures'

describe('AdminLayout', () => {
  beforeEach(() => {
    apiClient.clearCredentials()
    vi.restoreAllMocks()
    // useAppState polls the public state endpoint; default to an idle state.
    mockFetchState(() => makeState())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders login screen when unauthenticated', () => {
    render(
      <ToastProvider>
        <AdminLayout />
      </ToastProvider>,
    )

    expect(screen.getByText('Admin-Anmeldung')).toBeInTheDocument()
    expect(screen.getByLabelText(/Benutzername/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Passwort/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Anmelden' })).toBeInTheDocument()
  })

  it('handles login failure', async () => {
    vi.spyOn(apiClient, 'getTrucks').mockRejectedValue(new ApiError(401, 'Unauthorized'))

    render(
      <ToastProvider>
        <AdminLayout />
      </ToastProvider>,
    )

    fireEvent.change(screen.getByLabelText(/Benutzername/i), {
      target: { value: 'wrong_user' },
    })
    fireEvent.change(screen.getByLabelText(/Passwort/i), {
      target: { value: 'wrong_pass' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Anmelden' }))

    await waitFor(() => {
      expect(
        screen.getByText('Anmeldung fehlgeschlagen. Bitte Benutzername und Passwort prüfen.'),
      ).toBeInTheDocument()
    })
  })

  it('logs in successfully and displays management dashboard', async () => {
    vi.spyOn(apiClient, 'getTrucks').mockResolvedValue(trucks)
    vi.spyOn(apiClient, 'getAlerts').mockResolvedValue([])
    vi.spyOn(apiClient, 'getSettings').mockResolvedValue({ soundDurationSec: 60 })
    vi.spyOn(apiClient, 'getPersons').mockResolvedValue([])
    vi.spyOn(apiClient, 'getRosters').mockResolvedValue({ rosters: [], activeRosterId: null })

    render(
      <ToastProvider>
        <AdminLayout />
      </ToastProvider>,
    )

    // Credentials no longer pre-filled — login form starts empty (security: #2 fix).
    fireEvent.change(screen.getByLabelText(/Benutzername/i), {
      target: { value: 'ffw_bft' },
    })
    fireEvent.change(screen.getByLabelText(/Passwort/i), {
      target: { value: 'bft_2026' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Anmelden' }))

    await waitFor(() => {
      expect(screen.getByText('Verwaltung')).toBeInTheDocument()
      expect(screen.getByText('Fehlalarm auslösen')).toBeInTheDocument()
      expect(screen.getByText('Alarme & Übungen')).toBeInTheDocument()
      expect(screen.getByText('Fahrzeuge')).toBeInTheDocument()
    })
  })

  it('triggers false alarm drill on confirmation (R15)', async () => {
    apiClient.setCredentials('ffw_bft', 'bft_2026')
    vi.spyOn(apiClient, 'getTrucks').mockResolvedValue(trucks)
    vi.spyOn(apiClient, 'getAlerts').mockResolvedValue([])
    vi.spyOn(apiClient, 'getSettings').mockResolvedValue({ soundDurationSec: 60 })
    vi.spyOn(apiClient, 'getPersons').mockResolvedValue([])
    vi.spyOn(apiClient, 'getRosters').mockResolvedValue({ rosters: [], activeRosterId: null })
    const falseAlertSpy = vi.spyOn(apiClient, 'triggerFalseAlert').mockResolvedValue({
      success: true,
      activeSince: Date.now(),
    })

    render(
      <ToastProvider>
        <AdminLayout />
      </ToastProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Verwaltung')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Fehlalarm auslösen' }))
    expect(screen.getByText(/Möchten Sie sofort einen Fehlalarm auslösen\?/)).toBeInTheDocument()

    // Confirm false alarm dialog
    const confirmBtns = screen.getAllByRole('button', { name: 'Fehlalarm auslösen' })
    fireEvent.click(confirmBtns[confirmBtns.length - 1])

    await waitFor(() => {
      expect(falseAlertSpy).toHaveBeenCalled()
      expect(screen.getByText('Fehlalarm ausgelöst')).toBeInTheDocument()
    })
  })

  it('shows a cancel button and cancels an active false alarm (R15)', async () => {
    apiClient.setCredentials('ffw_bft', 'bft_2026')
    // A false alarm is currently active.
    mockFetchState(() => makeState({ falseAlarmActive: true }))
    vi.spyOn(apiClient, 'getTrucks').mockResolvedValue(trucks)
    vi.spyOn(apiClient, 'getAlerts').mockResolvedValue([])
    vi.spyOn(apiClient, 'getSettings').mockResolvedValue({ soundDurationSec: 60 })
    vi.spyOn(apiClient, 'getPersons').mockResolvedValue([])
    vi.spyOn(apiClient, 'getRosters').mockResolvedValue({ rosters: [], activeRosterId: null })
    const cancelSpy = vi.spyOn(apiClient, 'cancelFalseAlert').mockResolvedValue({ success: true })

    render(
      <ToastProvider>
        <AdminLayout />
      </ToastProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Verwaltung')).toBeInTheDocument()
    })

    // While a false alarm is active, the button reads "Fehlalarm abbrechen".
    await screen.findByRole('button', { name: 'Fehlalarm abbrechen' })
    fireEvent.click(screen.getByRole('button', { name: 'Fehlalarm abbrechen' }))
    expect(screen.getByText(/Möchten Sie den aktiven Fehlalarm abbrechen\?/)).toBeInTheDocument()

    // Confirm the cancel dialog.
    const confirmBtns = screen.getAllByRole('button', { name: 'Fehlalarm abbrechen' })
    fireEvent.click(confirmBtns[confirmBtns.length - 1])

    await waitFor(() => {
      expect(cancelSpy).toHaveBeenCalled()
      expect(screen.getByText('Fehlalarm abgebrochen')).toBeInTheDocument()
    })
  })

  it('handles false alarm rejection when alert active (AE1)', async () => {
    apiClient.setCredentials('ffw_bft', 'bft_2026')
    vi.spyOn(apiClient, 'getTrucks').mockResolvedValue(trucks)
    vi.spyOn(apiClient, 'getAlerts').mockResolvedValue([])
    vi.spyOn(apiClient, 'getSettings').mockResolvedValue({ soundDurationSec: 60 })
    vi.spyOn(apiClient, 'getPersons').mockResolvedValue([])
    vi.spyOn(apiClient, 'getRosters').mockResolvedValue({ rosters: [], activeRosterId: null })
    vi.spyOn(apiClient, 'triggerFalseAlert').mockRejectedValue(
      new Error('Alarm aktiv oder ausstehend'),
    )

    render(
      <ToastProvider>
        <AdminLayout />
      </ToastProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Verwaltung')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Fehlalarm auslösen' }))
    const confirmBtns = screen.getAllByRole('button', { name: 'Fehlalarm auslösen' })
    fireEvent.click(confirmBtns[confirmBtns.length - 1])

    await waitFor(() => {
      expect(screen.getByText('Alarm aktiv oder ausstehend')).toBeInTheDocument()
    })
  })

  it('switches tabs between Alarme and Fahrzeuge', async () => {
    apiClient.setCredentials('ffw_bft', 'bft_2026')
    vi.spyOn(apiClient, 'getTrucks').mockResolvedValue(trucks)
    vi.spyOn(apiClient, 'getAlerts').mockResolvedValue([])
    vi.spyOn(apiClient, 'getSettings').mockResolvedValue({ soundDurationSec: 60 })
    vi.spyOn(apiClient, 'getPersons').mockResolvedValue([])
    vi.spyOn(apiClient, 'getRosters').mockResolvedValue({ rosters: [], activeRosterId: null })

    render(
      <ToastProvider>
        <AdminLayout />
      </ToastProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Geplante Alarme')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('tab', { name: 'Fahrzeuge' }))

    await waitFor(() => {
      expect(screen.getByText('Fahrzeuge verwalten')).toBeInTheDocument()
    })
  })
})
