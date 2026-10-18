import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '@mui/material/styles'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Dashboard } from '../../src/client/components/dashboard/Dashboard'
import { SOUND_STORAGE_KEY } from '../../src/client/hooks/useAlarmSound'
import { theme } from '../../src/client/theme'
import { FakeAudio, activeAlert, makeState, mockFetchState } from './fixtures'

function renderDashboard() {
  return render(
    <ThemeProvider theme={theme}>
      <Dashboard />
    </ThemeProvider>,
  )
}

beforeEach(() => {
  FakeAudio.instances = []
  localStorage.clear()
  vi.stubGlobal('Audio', FakeAudio)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Dashboard', () => {
  it('idle: shows Einsatzmonitor and 5 unhighlighted truck cards (R19)', async () => {
    mockFetchState(() => makeState())
    renderDashboard()
    expect(await screen.findByRole('heading', { name: 'Einsatzmonitor' })).toBeInTheDocument()
    const cards = await screen.findAllByTestId('truck-card')
    expect(cards).toHaveLength(5)
    cards.forEach((c) => expect(c).toHaveAttribute('data-highlighted', 'false'))
  })

  it('active alert: shows details and highlights participating trucks only (R20)', async () => {
    mockFetchState(() => makeState({ activeAlert }))
    renderDashboard()
    expect(await screen.findByText('Musterstraße 5')).toBeInTheDocument()
    expect(screen.getByText('Wohnungsbrand')).toBeInTheDocument()
    expect(screen.getByText('Brandgeruch in Wohneinheit')).toBeInTheDocument()
    expect(screen.getByText('Schlüssel beim Nachbarn')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Einsatzmonitor' })).not.toBeInTheDocument()

    const cards = screen.getAllByTestId('truck-card')
    const highlighted = cards.filter((c) => c.getAttribute('data-highlighted') === 'true')
    expect(highlighted.map((c) => within(c).getByRole('heading').textContent)).toEqual([
      'ELF 1',
      'HLF 20',
    ])
  })

  it('active alert without notes omits the notes block', async () => {
    mockFetchState(() => makeState({ activeAlert: { ...activeAlert, notes: undefined } }))
    renderDashboard()
    await screen.findByText('Musterstraße 5')
    expect(screen.queryByText('Schlüssel beim Nachbarn')).not.toBeInTheDocument()
  })

  it('false alarm: shows Fehlalarm banner with unhighlighted trucks (R15)', async () => {
    mockFetchState(() => makeState({ falseAlarmActive: true }))
    renderDashboard()
    expect(await screen.findByRole('heading', { name: 'Fehlalarm' })).toBeInTheDocument()
    const cards = screen.getAllByTestId('truck-card')
    expect(cards).toHaveLength(5)
    cards.forEach((c) => expect(c).toHaveAttribute('data-highlighted', 'false'))
  })

  it('announces state changes through a polite live region (R1a)', async () => {
    mockFetchState(() => makeState({ activeAlert }))
    renderDashboard()
    await screen.findByText('Musterstraße 5')
    const live = screen.getByRole('status')
    expect(live).toHaveAttribute('aria-live', 'polite')
    expect(live).toHaveTextContent('Wohnungsbrand')
    expect(live).toHaveTextContent('ELF 1')
    expect(live).toHaveTextContent('HLF 20')
  })

  it('marks highlighted trucks in text, not by colour alone', async () => {
    mockFetchState(() => makeState({ activeAlert }))
    renderDashboard()
    await screen.findByText('Musterstraße 5')
    const highlighted = screen
      .getAllByTestId('truck-card')
      .filter((c) => c.getAttribute('data-highlighted') === 'true')
    highlighted.forEach((c) => expect(c).toHaveTextContent('Alarmiert'))
  })

  it('Ton toggle is off by default and persists after click (R18, AE6)', async () => {
    mockFetchState(() => makeState())
    const user = userEvent.setup()
    renderDashboard()
    const toggle = await screen.findByRole('button', { name: /Ton/ })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(localStorage.getItem(SOUND_STORAGE_KEY)).toBe('true')
  })

  it('Ton toggle restores persisted state on reload', async () => {
    localStorage.setItem(SOUND_STORAGE_KEY, 'true')
    mockFetchState(() => makeState())
    renderDashboard()
    const toggle = await screen.findByRole('button', { name: /Ton/ })
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
  })

  it('plays alarm sound for an active alert only when Ton is on', async () => {
    localStorage.setItem(SOUND_STORAGE_KEY, 'true')
    mockFetchState(() => makeState({ activeAlert }))
    renderDashboard()
    await waitFor(() => expect(FakeAudio.instances).toHaveLength(1))
    expect(FakeAudio.instances[0].loop).toBe(true)
    expect(FakeAudio.instances[0].play).toHaveBeenCalled()
  })

  it('stays silent for an active alert when Ton is off', async () => {
    mockFetchState(() => makeState({ activeAlert }))
    renderDashboard()
    await screen.findByText('Musterstraße 5')
    expect(FakeAudio.instances.every((a) => a.play.mock.calls.length === 0)).toBe(true)
  })

  it('shows a connection warning when the API is unreachable and no state is known', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    renderDashboard()
    expect(await screen.findByText(/Verbindung/)).toBeInTheDocument()
  })
})
