import type { Alert, Person, Roster, Settings, Truck, TruckCategory } from '../../shared/types'

export interface CreateTruckInput {
  name: string
  category: TruckCategory
}

export interface UpdateTruckInput {
  name?: string
  category?: TruckCategory
}

export interface CreateAlertInput {
  name: string
  category: string
  address: string
  info: string
  notes?: string
  truckIds?: string[]
  lat?: number
  lng?: number
  zoom?: number
}

export interface UpdateAlertInput {
  name?: string
  category?: string
  address?: string
  info?: string
  notes?: string
  truckIds?: string[]
  lat?: number
  lng?: number
  zoom?: number
}

export interface UpdateSettingsInput {
  soundDurationSec?: number
}

export interface CreateRosterInput {
  name: string
  assignments?: Roster['assignments']
}

export interface UpdateRosterInput {
  name?: string
  assignments?: Roster['assignments']
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const STORAGE_KEY_AUTH = 'bft_admin_auth'

class ApiClient {
  private authHeader: string | null = null

  constructor() {
    this.loadAuth()
  }

  private loadAuth(): void {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const saved = window.sessionStorage.getItem(STORAGE_KEY_AUTH)
      if (saved) {
        this.authHeader = saved
      }
    }
  }

  public setCredentials(user: string, pass: string): void {
    const encoded = typeof btoa !== 'undefined' ? btoa(`${user}:${pass}`) : Buffer.from(`${user}:${pass}`).toString('base64')
    this.authHeader = `Basic ${encoded}`
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(STORAGE_KEY_AUTH, this.authHeader)
    }
  }

  public clearCredentials(): void {
    this.authHeader = null
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem(STORAGE_KEY_AUTH)
    }
  }

  public isAuthenticated(): boolean {
    return this.authHeader !== null
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers || {})
    headers.set('Accept', 'application/json')
    if (options.body && typeof options.body === 'string') {
      headers.set('Content-Type', 'application/json')
    }
    if (this.authHeader) {
      headers.set('Authorization', this.authHeader)
    }

    const res = await fetch(path, {
      ...options,
      headers,
    })

    if (!res.ok) {
      let errorMessage = `HTTP ${res.status}`
      let data: unknown = undefined
      try {
        const json = await res.json()
        data = json
        if (json && typeof json.error === 'string') {
          errorMessage = json.error
        }
      } catch {
        // Non-JSON response
      }
      throw new ApiError(res.status, errorMessage, data)
    }

    if (res.status === 204) {
      return undefined as T
    }

    return (await res.json()) as T
  }

  // --- Trucks ---
  public async getTrucks(): Promise<Truck[]> {
    return this.request<Truck[]>('/api/trucks')
  }

  public async createTruck(input: CreateTruckInput): Promise<Truck> {
    return this.request<Truck>('/api/trucks', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  }

  public async updateTruck(id: string, input: UpdateTruckInput): Promise<Truck> {
    return this.request<Truck>(`/api/trucks/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  }

  public async deleteTruck(id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/api/trucks/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  }

  // --- Alerts ---
  public async getAlerts(): Promise<Alert[]> {
    return this.request<Alert[]>('/api/alerts')
  }

  public async createAlert(input: CreateAlertInput): Promise<Alert> {
    return this.request<Alert>('/api/alerts', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  }

  public async updateAlert(id: string, input: UpdateAlertInput): Promise<Alert> {
    return this.request<Alert>(`/api/alerts/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  }

  public async deleteAlert(id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/api/alerts/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  }

  public async triggerAlert(id: string, delayMinutes: number): Promise<Alert> {
    return this.request<Alert>(`/api/alerts/${encodeURIComponent(id)}/trigger`, {
      method: 'POST',
      body: JSON.stringify({ delayMinutes }),
    })
  }

  public async cancelTrigger(id: string): Promise<Alert> {
    return this.request<Alert>(`/api/alerts/${encodeURIComponent(id)}/cancel-trigger`, {
      method: 'POST',
    })
  }

  public async completeAlert(id: string): Promise<Alert> {
    return this.request<Alert>(`/api/alerts/${encodeURIComponent(id)}/complete`, {
      method: 'POST',
    })
  }

  // --- False Alert ---
  public async triggerFalseAlert(): Promise<{ success: boolean; activeSince: number }> {
    return this.request<{ success: boolean; activeSince: number }>('/api/false-alert', {
      method: 'POST',
    })
  }

  // --- Settings ---
  public async getSettings(): Promise<Settings> {
    return this.request<Settings>('/api/settings')
  }

  public async updateSettings(input: UpdateSettingsInput): Promise<Settings> {
    return this.request<Settings>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  }

  // --- Persons ---
  public async getPersons(): Promise<Person[]> {
    return this.request<Person[]>('/api/persons')
  }

  // --- Rosters ---
  public async getRosters(): Promise<{ rosters: Roster[]; activeRosterId: string | null }> {
    return this.request<{ rosters: Roster[]; activeRosterId: string | null }>('/api/rosters')
  }

  public async createRoster(input: CreateRosterInput): Promise<Roster> {
    return this.request<Roster>('/api/rosters', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  }

  public async updateRoster(id: string, input: UpdateRosterInput): Promise<Roster> {
    return this.request<Roster>(`/api/rosters/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  }

  public async deleteRoster(id: string): Promise<void> {
    return this.request<void>(`/api/rosters/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  }

  public async activateRoster(id: string): Promise<{ rosters: Roster[]; activeRosterId: string | null }> {
    return this.request<{ rosters: Roster[]; activeRosterId: string | null }>(
      `/api/rosters/${encodeURIComponent(id)}/activate`,
      { method: 'POST' },
    )
  }

  public async deactivateRoster(): Promise<{ rosters: Roster[]; activeRosterId: string | null }> {
    return this.request<{ rosters: Roster[]; activeRosterId: string | null }>(
      '/api/rosters/deactivate',
      { method: 'POST' },
    )
  }

  public async randomAssignRoster(id: string): Promise<{ roster: Roster; assigned: number; unassigned: string[] }> {
    return this.request<{ roster: Roster; assigned: number; unassigned: string[] }>(
      `/api/rosters/${encodeURIComponent(id)}/random-assign`,
      { method: 'POST' },
    )
  }
}

export const apiClient = new ApiClient()
