import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '../../src/client/api/client'
import { App } from '../../src/client/App'
import { makeState, trucks } from './fixtures'

describe('App', () => {
  beforeEach(() => {
    apiClient.clearCredentials()
    vi.restoreAllMocks()

    const mockFetch = vi.fn(async (url: string) => {
      if (url === '/api/state') {
        return {
          ok: true,
          status: 200,
          json: async () => makeState(),
        }
      }
      if (url === '/api/trucks') {
        return {
          ok: true,
          status: 200,
          json: async () => trucks,
        }
      }
      if (url === '/api/alerts') {
        return {
          ok: true,
          status: 200,
          json: async () => [],
        }
      }
      if (url === '/api/settings') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ soundDurationSec: 60 }),
        }
      }
      return {
        ok: false,
        status: 404,
        json: async () => ({ error: 'Not found' }),
      }
    })
    vi.stubGlobal('fetch', mockFetch)
  })

  it('renders Dashboard by default', async () => {
    render(<App />)

    expect(screen.getByText('Einsatzsimulator')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Einsatzmonitor' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Verwaltung' })).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Einsatzmonitor')).toBeInTheDocument()
    })
  })

  it('navigates to Admin view when clicking Verwaltung tab', async () => {
    render(<App />)

    const adminTab = screen.getByRole('tab', { name: 'Verwaltung' })
    fireEvent.click(adminTab)

    expect(screen.getByText('Admin-Anmeldung')).toBeInTheDocument()
  })

  it('shows logout button and handles logout when authenticated', async () => {
    apiClient.setCredentials('ffw_bft', 'bft_2026')

    render(<App />)

    const adminTab = screen.getByRole('tab', { name: 'Verwaltung' })
    fireEvent.click(adminTab)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Abmelden' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Abmelden' }))

    expect(apiClient.isAuthenticated()).toBe(false)
    expect(screen.getByText('Admin-Anmeldung')).toBeInTheDocument()
  })
})
