import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiClient } from '../../src/client/api/client'

describe('ApiClient', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    apiClient.clearCredentials()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('sets and clears basic auth credentials', () => {
    expect(apiClient.isAuthenticated()).toBe(false)
    apiClient.setCredentials('admin', 'secret')
    expect(apiClient.isAuthenticated()).toBe(true)
    apiClient.clearCredentials()
    expect(apiClient.isAuthenticated()).toBe(false)
  })

  it('includes Authorization header when authenticated', async () => {
    apiClient.setCredentials('ffw_bft', 'bft_2026')

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ id: '1', name: 'HLF 20', seats: 5 }],
    })
    global.fetch = mockFetch

    const trucks = await apiClient.getTrucks()
    expect(trucks).toHaveLength(1)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/trucks')
    const headers = options.headers as Headers
    expect(headers.get('Authorization')).toBe(`Basic ${btoa('ffw_bft:bft_2026')}`)
  })

  it('handles 401 Unauthorized errors and raises ApiError', async () => {
    apiClient.setCredentials('wrong', 'creds')

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    })
    global.fetch = mockFetch

    await expect(apiClient.getTrucks()).rejects.toThrow(ApiError)
    await expect(apiClient.getTrucks()).rejects.toMatchObject({
      status: 401,
      message: 'Unauthorized',
    })
  })

  it('handles 409 Conflict domain errors', async () => {
    apiClient.setCredentials('ffw_bft', 'bft_2026')

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: 'Alarm aktiv oder ausstehend' }),
    })
    global.fetch = mockFetch

    await expect(apiClient.triggerAlert('123', 5)).rejects.toMatchObject({
      status: 409,
      message: 'Alarm aktiv oder ausstehend',
    })
  })

  it('supports all truck, alert, settings, and false alert endpoints', async () => {
    apiClient.setCredentials('ffw_bft', 'bft_2026')

    const mockFetch = vi.fn().mockImplementation(async (url: string, options: RequestInit) => {
      if (url === '/api/trucks' && options.method === 'POST') {
        return { ok: true, status: 201, json: async () => ({ id: 't1', name: 'LF 10', seats: 4 }) }
      }
      if (url === '/api/trucks/t1' && options.method === 'PATCH') {
        return { ok: true, status: 200, json: async () => ({ id: 't1', name: 'LF 10 Updated', seats: 6 }) }
      }
      if (url === '/api/trucks/t1' && options.method === 'DELETE') {
        return { ok: true, status: 200, json: async () => ({ success: true }) }
      }
      if (url === '/api/alerts' && !options.method) {
        return { ok: true, status: 200, json: async () => [] }
      }
      if (url === '/api/alerts' && options.method === 'POST') {
        return { ok: true, status: 201, json: async () => ({ id: 'a1', name: 'Brand', status: 'pending' }) }
      }
      if (url === '/api/alerts/a1' && options.method === 'PATCH') {
        return { ok: true, status: 200, json: async () => ({ id: 'a1', name: 'Brand Updated' }) }
      }
      if (url === '/api/alerts/a1' && options.method === 'DELETE') {
        return { ok: true, status: 200, json: async () => ({ success: true }) }
      }
      if (url === '/api/alerts/a1/cancel-trigger' && options.method === 'POST') {
        return { ok: true, status: 200, json: async () => ({ id: 'a1', status: 'pending' }) }
      }
      if (url === '/api/alerts/a1/complete' && options.method === 'POST') {
        return { ok: true, status: 200, json: async () => ({ id: 'a1', status: 'complete' }) }
      }
      if (url === '/api/false-alert' && options.method === 'POST') {
        return { ok: true, status: 200, json: async () => ({ success: true, activeSince: 1000 }) }
      }
      if (url === '/api/settings' && !options.method) {
        return { ok: true, status: 200, json: async () => ({ soundDurationSec: 60 }) }
      }
      if (url === '/api/settings' && options.method === 'PATCH') {
        return { ok: true, status: 200, json: async () => ({ soundDurationSec: 90 }) }
      }
      return { ok: false, status: 404, json: async () => ({ error: 'Not found' }) }
    })
    global.fetch = mockFetch

    const tCreated = await apiClient.createTruck({ name: 'LF 10', seats: 4 })
    expect(tCreated.id).toBe('t1')

    const tUpdated = await apiClient.updateTruck('t1', { name: 'LF 10 Updated', seats: 6 })
    expect(tUpdated.name).toBe('LF 10 Updated')

    const tDeleted = await apiClient.deleteTruck('t1')
    expect(tDeleted.success).toBe(true)

    const alerts = await apiClient.getAlerts()
    expect(alerts).toEqual([])

    const aCreated = await apiClient.createAlert({
      name: 'Brand',
      category: 'Brand',
      address: 'Hauptstr 1',
      info: 'Info',
    })
    expect(aCreated.id).toBe('a1')

    const aUpdated = await apiClient.updateAlert('a1', { name: 'Brand Updated' })
    expect(aUpdated.name).toBe('Brand Updated')

    const aCancelled = await apiClient.cancelTrigger('a1')
    expect(aCancelled.status).toBe('pending')

    const aCompleted = await apiClient.completeAlert('a1')
    expect(aCompleted.status).toBe('complete')

    const aDeleted = await apiClient.deleteAlert('a1')
    expect(aDeleted.success).toBe(true)

    const falseAlert = await apiClient.triggerFalseAlert()
    expect(falseAlert.success).toBe(true)

    const settings = await apiClient.getSettings()
    expect(settings.soundDurationSec).toBe(60)

    const updatedSettings = await apiClient.updateSettings({ soundDurationSec: 90 })
    expect(updatedSettings.soundDurationSec).toBe(90)
  })
})
