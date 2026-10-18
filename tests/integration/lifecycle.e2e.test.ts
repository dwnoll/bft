import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { AddressInfo } from 'node:net'
import { createApp } from '../../src/server/index'
import { StateEngine } from '../../src/server/engine'
import { load, save } from '../../src/server/storage'
import { DEFAULT_ADMIN_PASS, DEFAULT_ADMIN_USER } from '../../src/server/config'
import {
  AUTO_COMPLETE_MS,
  defaultDataFile,
} from '../../src/shared/constants'
import type { Alert, PublicState } from '../../src/shared/types'

const MIN = 60_000
const BASE = 1_700_000_000_000
const auth = `Basic ${Buffer.from(`${DEFAULT_ADMIN_USER}:${DEFAULT_ADMIN_PASS}`).toString('base64')}`

describe('Alert lifecycle end-to-end & production serving (Unit 6)', () => {
  let tmpDir: string
  let dataFile: string
  let staticDir: string
  let now: number
  let engine: StateEngine
  let server: http.Server
  let baseUrl: string
  let lastPersist: Promise<void> = Promise.resolve()

  async function boot(): Promise<void> {
    const data = await load(dataFile)
    engine = new StateEngine(data, {
      persist: (d) => (lastPersist = save(dataFile, d)),
      now: () => now,
    })
    server = http.createServer(createApp(engine, { staticDir }))
    await new Promise<void>((resolve) => server.listen(0, resolve))
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  }

  async function shutdown(): Promise<void> {
    // Persists are fire-and-forget in the engine; wait for the last queued write.
    await lastPersist
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    )
  }

  async function call(method: string, url: string, body?: unknown, withAuth = true) {
    const res = await fetch(`${baseUrl}${url}`, {
      method,
      headers: {
        ...(withAuth ? { Authorization: auth } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    const type = res.headers.get('content-type') ?? ''
    const parsed = type.includes('application/json') ? await res.json() : await res.text()
    return { status: res.status, body: parsed as any }
  }

  const getState = async () => (await call('GET', '/api/state', undefined, false)).body as PublicState

  beforeEach(async () => {
    now = BASE
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bft-e2e-'))
    dataFile = path.join(tmpDir, 'data.json')
    staticDir = path.join(tmpDir, 'client')
    fs.mkdirSync(path.join(staticDir, 'sound'), { recursive: true })
    fs.writeFileSync(path.join(staticDir, 'index.html'), '<html><body>SPA</body></html>')
    fs.writeFileSync(path.join(staticDir, 'sound', 'Warnung.mp3'), 'fake-audio')
    await boot()
  })

  afterEach(async () => {
    await shutdown()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  async function createAlert(): Promise<Alert> {
    const trucks = (await call('GET', '/api/trucks')).body as { id: string }[]
    const res = await call('POST', '/api/alerts', {
      name: 'Übung',
      category: 'Brand',
      address: 'Hauptstr. 1',
      info: 'Zimmerbrand',
      truckIds: [trucks[0].id],
    })
    expect(res.status).toBe(201)
    return res.body as Alert
  }

  it('runs a full drill: create -> arm 3 min -> fire -> active -> auto-complete after 10 min', async () => {
    const alert = await createAlert()
    expect(alert.status).toBe('pending')

    const armed = await call('POST', `/api/alerts/${alert.id}/trigger`, { delayMinutes: 3 })
    expect(armed.status).toBe(200)
    expect(armed.body.triggerAt).toBe(BASE + 3 * MIN)

    let state = await getState()
    expect(state.activeAlert).toBeNull()
    expect(state.pendingTrigger?.countdownMs).toBe(3 * MIN)

    now = BASE + 3 * MIN - 1000
    engine.tick(now)
    state = await getState()
    expect(state.activeAlert).toBeNull()

    now = BASE + 3 * MIN
    engine.tick(now)
    state = await getState()
    expect(state.activeAlert?.id).toBe(alert.id)
    expect(state.activeAlert?.status).toBe('active')
    expect(state.pendingTrigger).toBeNull()

    // A second trigger while active is rejected (single-alarm invariant).
    const second = await call('POST', `/api/alerts/${alert.id}/trigger`, { delayMinutes: 3 })
    expect(second.status).toBe(409)
    const falseAlert = await call('POST', '/api/false-alert')
    expect(falseAlert.status).toBe(409)

    now = BASE + 3 * MIN + AUTO_COMPLETE_MS
    engine.tick(now)
    state = await getState()
    expect(state.activeAlert).toBeNull()
    const alerts = (await call('GET', '/api/alerts')).body as Alert[]
    expect(alerts.find((a) => a.id === alert.id)?.status).toBe('complete')
  })

  it('cancels an armed trigger and allows re-arming', async () => {
    const alert = await createAlert()
    await call('POST', `/api/alerts/${alert.id}/trigger`, { delayMinutes: 5 })
    const cancel = await call('POST', `/api/alerts/${alert.id}/cancel-trigger`)
    expect(cancel.status).toBe(200)
    expect((await getState()).pendingTrigger).toBeNull()
    const again = await call('POST', `/api/alerts/${alert.id}/trigger`, { delayMinutes: 15 })
    expect(again.status).toBe(200)
  })

  it('rejects delays outside 3-15 minutes', async () => {
    const alert = await createAlert()
    expect((await call('POST', `/api/alerts/${alert.id}/trigger`, { delayMinutes: 2 })).status).toBe(400)
    expect((await call('POST', `/api/alerts/${alert.id}/trigger`, { delayMinutes: 16 })).status).toBe(400)
  })

  it('manually completes an active alert and runs a false alarm that auto-clears', async () => {
    const alert = await createAlert()
    await call('POST', `/api/alerts/${alert.id}/trigger`, { delayMinutes: 3 })
    now = BASE + 3 * MIN
    engine.tick(now)
    expect((await call('POST', `/api/alerts/${alert.id}/complete`)).status).toBe(200)
    expect((await getState()).activeAlert).toBeNull()

    const fa = await call('POST', '/api/false-alert')
    expect(fa.status).toBeLessThan(300)
    expect((await getState()).falseAlarmActive).toBe(true)
    now += AUTO_COMPLETE_MS
    engine.tick(now)
    expect((await getState()).falseAlarmActive).toBe(false)
  })

  it('preserves a running countdown across a server restart (R3, R17a)', async () => {
    const alert = await createAlert()
    await call('POST', `/api/alerts/${alert.id}/trigger`, { delayMinutes: 3 })
    await shutdown()

    now = BASE + 2 * MIN
    await boot()
    let state = await getState()
    expect(state.pendingTrigger?.countdownMs).toBe(1 * MIN)

    now = BASE + 3 * MIN
    engine.tick(now) // startServer evaluates elapsed countdowns on boot
    state = await getState()
    expect(state.activeAlert?.id).toBe(alert.id)
  })

  it('serves the SPA, audio asset and index fallback from a single port (PRD §1, §9)', async () => {
    const root = await call('GET', '/', undefined, false)
    expect(root.status).toBe(200)
    expect(root.body).toContain('SPA')

    const deep = await call('GET', '/admin/anything', undefined, false)
    expect(deep.status).toBe(200)
    expect(deep.body).toContain('SPA')

    const sound = await call('GET', '/sound/Warnung.mp3', undefined, false)
    expect(sound.status).toBe(200)
    expect(sound.body).toBe('fake-audio')
  })

  it('does not apply SPA fallback to unknown API routes and keeps /api/state public', async () => {
    expect((await call('GET', '/api/state', undefined, false)).status).toBe(200)
    expect((await call('GET', '/api/nope', undefined, false)).status).toBe(401)
    const unknown = await call('GET', '/api/nope')
    expect(unknown.status).toBe(404)
    expect(String(unknown.body)).not.toContain('SPA')
  })

  it('seeds a default data file on first boot', async () => {
    const onDisk = JSON.parse(fs.readFileSync(dataFile, 'utf8'))
    expect(onDisk.trucks).toHaveLength(defaultDataFile().trucks.length)
  })
})
