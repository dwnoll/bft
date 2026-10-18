import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { load, save } from '../../src/server/storage'
import type { Alert, DataFile } from '../../src/shared/types'

const ALERT_NAMES = ['Wohnungsbrand', 'THL B3']
const TRUCK_NAMES = ['ELF 1', 'HLF 20', 'LF 10', 'TLF 16', 'DLK 23']

let tmpDir: string
let file: string

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'bft-storage-'))
  file = path.join(tmpDir, 'data.json')
})

function pendingAlert(partial: Partial<Alert> = {}): Alert {
  return {
    id: `seed-alert-${Math.random().toString(36).slice(2)}`,
    name: 'Test',
    category: 'Test',
    address: 'Test',
    info: 'Test',
    truckIds: [],
    status: 'pending',
    ...partial,
  }
}

describe('storage seeding', () => {
  it('creates and seeds data.json on first load when missing', async () => {
    expect(existsSync(file)).toBe(false)

    const data = await load(file)

    expect(existsSync(file)).toBe(true)
    expect(data.trucks).toHaveLength(5)
    expect(data.trucks.map((t) => t.name)).toEqual(TRUCK_NAMES)
    expect(data.alerts).toHaveLength(2)
    expect(data.alerts.map((a) => a.name)).toEqual(ALERT_NAMES)
    expect(data.settings.soundDurationSec).toBe(60)
  })

  it('does not re-seed when the file already exists', async () => {
    const first = await load(file)
    first.alerts.push(pendingAlert())

    await save(file, first)

    const second = await load(file)
    expect(second.alerts).toHaveLength(3)
  })
})

describe('storage save', () => {
  it('writes atomically and persists for later load', async () => {
    const data = await load(file)
    data.trucks.push({ id: 't1', name: 'New Truck', seats: 1 })

    await save(file, data)

    const loaded = await load(file)
    expect(loaded.trucks).toHaveLength(6)
    expect(loaded.trucks.find((t) => t.id === 't1')).toMatchObject({ name: 'New Truck', seats: 1 })
  })

  it('serializes multiple rapid sequential saves without corruption', async () => {
    const data = await load(file)

    const s1 = save(file, { ...data, trucks: [{ id: '1', name: 'A', seats: 1 }] })
    const s2 = save(file, { ...data, trucks: [{ id: '2', name: 'B', seats: 1 }] })
    const s3 = save(file, { ...data, trucks: [{ id: '3', name: 'C', seats: 1 }] })

    await Promise.all([s1, s2, s3])

    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    expect(Array.isArray(parsed.trucks)).toBe(true)
    expect(parsed.trucks).toHaveLength(1)
    expect(parsed.trucks[0].id).toBe('3')
    expect(parsed.settings.soundDurationSec).toBe(60)
  })

  it('raises a descriptive error on invalid JSON instead of overwriting', async () => {
    writeFileSync(file, '{ this is : not valid json ]')

    await expect(load(file)).rejects.toThrow(/Failed to parse data\.json/)
  })
})
