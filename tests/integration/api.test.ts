import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { createApp } from '../../src/server/index'
import { StateEngine, type DataFile } from '../../src/server/engine'
import { DEFAULT_ADMIN_USER, DEFAULT_ADMIN_PASS, defaultDataFile } from '../../src/shared/constants'
import type { PublicState, Truck, Alert, Settings } from '../../src/shared/types'

describe('Express REST API & Authentication Integration Tests (Unit 3)', () => {
  let server: http.Server
  let baseUrl: string
  let engine: StateEngine
  let nowEpoch = 1_700_000_000_000 // Fixed base epoch

  const authHeader = `Basic ${Buffer.from(`${DEFAULT_ADMIN_USER}:${DEFAULT_ADMIN_PASS}`).toString('base64')}`

  beforeEach(async () => {
    nowEpoch = 1_700_000_000_000
    const data: DataFile = defaultDataFile()
    engine = new StateEngine(data, {
      persist: async () => {},
      now: () => nowEpoch,
    })

    const app = createApp(engine)
    server = http.createServer(app)
    await new Promise<void>((resolve) => server.listen(0, resolve))
    const port = (server.address() as AddressInfo).port
    baseUrl = `http://127.0.0.1:${port}`
  })

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()))
    })
  })

  // Helper for typed fetch calls
  async function api(path: string, init?: RequestInit) {
    const res = await fetch(`${baseUrl}${path}`, init)
    let body: any = null
    const contentType = res.headers.get('content-type')
    if (contentType?.includes('application/json')) {
      body = await res.json()
    } else {
      body = await res.text()
    }
    return { res, status: res.status, body, headers: res.headers }
  }

  // --- Public State Endpoint (R4, PRD §4, §10) ---
  describe('GET /api/state (Public)', () => {
    it('returns public state without requiring authentication', async () => {
      const { status, body } = await api('/api/state')
      expect(status).toBe(200)
      const state = body as PublicState
      expect(state.activeAlert).toBeNull()
      expect(state.falseAlarmActive).toBe(false)
      expect(state.pendingTrigger).toBeNull()
      expect(state.trucks).toHaveLength(5)
      expect(state.settings.soundDurationSec).toBe(60)
    })
  })

  // --- Basic Authentication Guard (R4, D2) ---
  describe('Basic Authentication on Protected Endpoints', () => {
    it('rejects unauthenticated requests to /api/trucks with 401', async () => {
      const { status, body, headers } = await api('/api/trucks')
      expect(status).toBe(401)
      expect(body).toEqual({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
      expect(headers.get('www-authenticate')).toContain('Basic realm="Firealarm Simulator Admin"')
    })

    it('rejects invalid credentials with 401', async () => {
      const badAuth = `Basic ${Buffer.from('wrong:pass').toString('base64')}`
      const { status, body } = await api('/api/trucks', {
        headers: { Authorization: badAuth },
      })
      expect(status).toBe(401)
      expect(body).toEqual({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
    })

    it('allows access with valid credentials', async () => {
      const { status, body } = await api('/api/trucks', {
        headers: { Authorization: authHeader },
      })
      expect(status).toBe(200)
      expect(Array.isArray(body)).toBe(true)
      expect(body).toHaveLength(5)
    })
  })

  // --- Trucks CRUD (PRD §5, §10, R5, R6) ---
  describe('Trucks API', () => {
    it('creates a new truck with POST /api/trucks', async () => {
      const { status, body } = await api('/api/trucks', {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'RW 2', seats: 3 }),
      })

      expect(status).toBe(201)
      const truck = body as Truck
      expect(truck.id).toBeDefined()
      expect(truck.name).toBe('RW 2')
      expect(truck.seats).toBe(3)
    })

    it('validates truck creation input (returns 400 on empty name or invalid seats)', async () => {
      const res1 = await api('/api/trucks', {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '', seats: 3 }),
      })
      expect(res1.status).toBe(400)

      const res2 = await api('/api/trucks', {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Valid', seats: -2 }),
      })
      expect(res2.status).toBe(400)
    })

    it('updates a truck with PATCH /api/trucks/:id', async () => {
      const truckId = engine.trucks[0].id
      const { status, body } = await api(`/api/trucks/${truckId}`, {
        method: 'PATCH',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'ELF 1 Mod', seats: 3 }),
      })

      expect(status).toBe(200)
      const updated = body as Truck
      expect(updated.name).toBe('ELF 1 Mod')
      expect(updated.seats).toBe(3)
    })

    it('returns 404 when patching a non-existent truck', async () => {
      const { status } = await api('/api/trucks/unknown-id', {
        method: 'PATCH',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Name' }),
      })
      expect(status).toBe(404)
    })

    it('deletes a truck and cascades removal from alert truckIds (R6, AE5)', async () => {
      const truckToDelete = engine.trucks.find((t) => t.name === 'ELF 1')!
      const alertWithTruck = engine.alerts.find((a) => a.truckIds.includes(truckToDelete.id))!
      expect(alertWithTruck.truckIds).toContain(truckToDelete.id)

      const { status, body } = await api(`/api/trucks/${truckToDelete.id}`, {
        method: 'DELETE',
        headers: { Authorization: authHeader },
      })

      expect(status).toBe(200)
      expect(body).toEqual({ success: true })
      expect(engine.trucks.find((t) => t.id === truckToDelete.id)).toBeUndefined()
      // Alert should still exist but without deleted truckId
      const refreshedAlert = engine.alerts.find((a) => a.id === alertWithTruck.id)!
      expect(refreshedAlert.truckIds).not.toContain(truckToDelete.id)
    })

    it('returns 404 when deleting a non-existent truck', async () => {
      const { status } = await api('/api/trucks/unknown-id', {
        method: 'DELETE',
        headers: { Authorization: authHeader },
      })
      expect(status).toBe(404)
    })
  })

  // --- Alerts CRUD & Lifecycle (PRD §6, §7, §10, R7, R8, R9, R10, R13, R14) ---
  describe('Alerts API', () => {
    it('creates a new planned alert with POST /api/alerts', async () => {
      const truckIds = [engine.trucks[0].id]
      const { status, body } = await api('/api/alerts', {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Kellerbrand',
          category: 'Brand 2',
          address: 'Schulstraße 12',
          info: 'Starke Rauchentwicklung im UG',
          notes: 'Zugang über Nordseite',
          truckIds,
        }),
      })

      expect(status).toBe(201)
      const alert = body as Alert
      expect(alert.id).toBeDefined()
      expect(alert.name).toBe('Kellerbrand')
      expect(alert.status).toBe('pending')
      expect(alert.truckIds).toEqual(truckIds)
      expect(alert.notes).toBe('Zugang über Nordseite')
    })

    it('validates alert required fields (returns 400 if name/category/address/info missing)', async () => {
      const { status } = await api('/api/alerts', {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Missing fields',
          category: '',
          address: '',
          info: '',
        }),
      })
      expect(status).toBe(400)
    })

    it('updates an alert with PATCH /api/alerts/:id', async () => {
      const alertId = engine.alerts[0].id
      const { status, body } = await api(`/api/alerts/${alertId}`, {
        method: 'PATCH',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Updated Name',
          info: 'Updated Info',
        }),
      })

      expect(status).toBe(200)
      const updated = body as Alert
      expect(updated.name).toBe('Updated Name')
      expect(updated.info).toBe('Updated Info')
    })

    it('deletes an alert with DELETE /api/alerts/:id', async () => {
      const alertId = engine.alerts[0].id
      const { status, body } = await api(`/api/alerts/${alertId}`, {
        method: 'DELETE',
        headers: { Authorization: authHeader },
      })

      expect(status).toBe(200)
      expect(body).toEqual({ success: true })
      expect(engine.alerts.find((a) => a.id === alertId)).toBeUndefined()
    })

    it('arms a delayed trigger with POST /api/alerts/:id/trigger (R9, AE2)', async () => {
      const alertId = engine.alerts[0].id
      const { status, body } = await api(`/api/alerts/${alertId}/trigger`, {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ delayMinutes: 5 }),
      })

      expect(status).toBe(200)
      const armed = body as Alert
      expect(armed.triggerAt).toBe(nowEpoch + 5 * 60_000)

      // State endpoint reflects pendingTrigger countdown
      const stateRes = await api('/api/state')
      expect(stateRes.body.pendingTrigger).toEqual({
        id: alertId,
        countdownMs: 300_000,
      })
    })

    it('rejects trigger delay outside 3–15 minutes with 400', async () => {
      const alertId = engine.alerts[0].id
      const resLow = await api(`/api/alerts/${alertId}/trigger`, {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ delayMinutes: 2 }),
      })
      expect(resLow.status).toBe(400)

      const resHigh = await api(`/api/alerts/${alertId}/trigger`, {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ delayMinutes: 16 }),
      })
      expect(resHigh.status).toBe(400)
    })

    it('enforces single-active-alarm invariant (409 Conflict) when slot occupied (R10, AE1)', async () => {
      const alert1 = engine.alerts[0].id
      const alert2 = engine.alerts[1].id

      // Arm first alert
      await api(`/api/alerts/${alert1}/trigger`, {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ delayMinutes: 5 }),
      })

      // Attempt to arm second alert
      const { status, body } = await api(`/api/alerts/${alert2}/trigger`, {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ delayMinutes: 5 }),
      })

      expect(status).toBe(409)
      expect(body.error).toBe('Alarm aktiv oder ausstehend')
    })

    it('cancels pending trigger with POST /api/alerts/:id/cancel-trigger', async () => {
      const alertId = engine.alerts[0].id
      await api(`/api/alerts/${alertId}/trigger`, {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ delayMinutes: 5 }),
      })

      const { status, body } = await api(`/api/alerts/${alertId}/cancel-trigger`, {
        method: 'POST',
        headers: { Authorization: authHeader },
      })

      expect(status).toBe(200)
      const cancelled = body as Alert
      expect(cancelled.triggerAt).toBeUndefined()

      const stateRes = await api('/api/state')
      expect(stateRes.body.pendingTrigger).toBeNull()
    })

    it('completes active alert with POST /api/alerts/:id/complete (R13)', async () => {
      const alertId = engine.alerts[0].id
      engine.armTrigger(alertId, 5, nowEpoch)
      engine.tick(nowEpoch + 300_000) // now active

      const { status, body } = await api(`/api/alerts/${alertId}/complete`, {
        method: 'POST',
        headers: { Authorization: authHeader },
      })

      expect(status).toBe(200)
      const completed = body as Alert
      expect(completed.status).toBe('complete')
      expect(completed.activeSince).toBeUndefined()
    })

    it('rejects completing an alert that is not active with 409', async () => {
      const alertId = engine.alerts[0].id
      const { status } = await api(`/api/alerts/${alertId}/complete`, {
        method: 'POST',
        headers: { Authorization: authHeader },
      })
      expect(status).toBe(409)
    })
  })

  // --- False Alarm API (PRD §8, §10, R15, R16) ---
  describe('False Alarm API (POST /api/false-alert)', () => {
    it('triggers a false alarm drill and exposes it on /api/state', async () => {
      const { status, body } = await api('/api/false-alert', {
        method: 'POST',
        headers: { Authorization: authHeader },
      })

      expect(status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.activeSince).toBe(nowEpoch)

      const stateRes = await api('/api/state')
      expect(stateRes.body.falseAlarmActive).toBe(true)
      expect(stateRes.body.activeAlert).toBeNull()
    })

    it('rejects false alarm when another alarm is armed or active with 409 (R16)', async () => {
      engine.armTrigger(engine.alerts[0].id, 5, nowEpoch)

      const { status, body } = await api('/api/false-alert', {
        method: 'POST',
        headers: { Authorization: authHeader },
      })

      expect(status).toBe(409)
      expect(body.error).toBe('Alarm aktiv oder ausstehend')
    })
  })

  // --- Settings API (PRD §9, §10, R17) ---
  describe('Settings API', () => {
    it('retrieves settings with GET /api/settings', async () => {
      const { status, body } = await api('/api/settings', {
        headers: { Authorization: authHeader },
      })

      expect(status).toBe(200)
      expect(body.soundDurationSec).toBe(60)
    })

    it('updates soundDurationSec with PATCH /api/settings', async () => {
      const { status, body } = await api('/api/settings', {
        method: 'PATCH',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ soundDurationSec: 90 }),
      })

      expect(status).toBe(200)
      const settings = body as Settings
      expect(settings.soundDurationSec).toBe(90)

      const stateRes = await api('/api/state')
      expect(stateRes.body.settings.soundDurationSec).toBe(90)
    })

    it('rejects invalid soundDurationSec with 400', async () => {
      const { status } = await api('/api/settings', {
        method: 'PATCH',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ soundDurationSec: -5 }),
      })

      expect(status).toBe(400)
    })
  })

  // --- Full End-to-End Drill Scenario ---
  describe('Full End-to-End Drill API Scenario', () => {
    it('executes a complete alarm drill cycle across API endpoints', async () => {
      // 1. Admin creates custom truck
      const createTruckRes = await api('/api/trucks', {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'KdoW 1', seats: 2 }),
      })
      expect(createTruckRes.status).toBe(201)
      const newTruck = createTruckRes.body as Truck

      // 2. Admin creates drill alert with that truck
      const createAlertRes = await api('/api/alerts', {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Übung Industriebrand',
          category: 'Brand 3',
          address: 'Industriepark 7',
          info: 'Brand einer Lagerhalle',
          truckIds: [newTruck.id],
        }),
      })
      expect(createAlertRes.status).toBe(201)
      const newAlert = createAlertRes.body as Alert

      // 3. Admin arms 3-minute delayed trigger
      const triggerRes = await api(`/api/alerts/${newAlert.id}/trigger`, {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ delayMinutes: 3 }),
      })
      expect(triggerRes.status).toBe(200)

      // 4. Public dashboard checks state -> pending trigger counting down
      let stateRes = await api('/api/state')
      expect(stateRes.body.activeAlert).toBeNull()
      expect(stateRes.body.pendingTrigger?.id).toBe(newAlert.id)

      // 5. 3 minutes pass -> tick runs -> alert becomes active
      nowEpoch += 180_000
      engine.tick(nowEpoch)

      stateRes = await api('/api/state')
      expect(stateRes.body.activeAlert?.id).toBe(newAlert.id)
      expect(stateRes.body.activeAlert?.truckIds).toContain(newTruck.id)
      expect(stateRes.body.pendingTrigger).toBeNull()

      // 6. Admin completes the active alert
      const completeRes = await api(`/api/alerts/${newAlert.id}/complete`, {
        method: 'POST',
        headers: { Authorization: authHeader },
      })
      expect(completeRes.status).toBe(200)

      // 7. Public dashboard checks state -> back to idle
      stateRes = await api('/api/state')
      expect(stateRes.body.activeAlert).toBeNull()
      expect(stateRes.body.falseAlarmActive).toBe(false)
    })
  })
})
