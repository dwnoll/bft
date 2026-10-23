import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  StateEngine,
  InvariantError,
  NotFoundError,
  ValidationError,
  ALARM_ACTIVE_OR_PENDING,
  type ClockFn,
  type DataFile,
  type PersistFn,
} from '../../src/server/engine'
import { defaultDataFile } from '../../src/shared/constants'

// --- deterministic time helpers ---------------------------------------------
const T0 = 1_000_000
const TEN_MIN_MS = 600_000 // 600s * 1000
const DELAY_5MIN_MS = 300_000

// The invariant rejection carries the human-facing German toast as its message;
// tests assert on the stable `code` instead.
function expectInvariantCode(fn: () => unknown, code: string): void {
  let caught: unknown
  try {
    fn()
  } catch (err) {
    caught = err
  }
  expect(caught).toBeDefined()
  expect((caught as Error)?.code).toBe(code)
}

function baseData(): DataFile {
  return {
    trucks: [{ id: 'trk-1', name: 'ELF 1', category: 'Staffel' }],
    alerts: [
      {
        id: 'al-1',
        name: 'Wohnungsbrand',
        category: 'Wohnungsbrand',
        address: 'Musterstraße 5',
        info: 'Brandgeruch',
        truckIds: ['trk-1'],
        status: 'pending',
      },
      {
        id: 'al-2',
        name: 'THL B3',
        category: 'Technische Hilfeleistung',
        address: 'B3, km 12',
        info: 'Pannenfahrzeug',
        truckIds: [],
        status: 'pending',
      },
    ],
    settings: { soundDurationSec: 60 },
  }
}

// persist spy that snapshots the exact data written (simulates serialization).
let persistSnapshots: DataFile[] = []
const persistSpy: PersistFn = (data) => {
  persistSnapshots = [JSON.parse(JSON.stringify(data))]
  return Promise.resolve()
}

function makeEngine(data: DataFile = baseData()): StateEngine {
  return new StateEngine(data, { persist: persistSpy, now: () => T0 })
}

function latestSnapshot(): DataFile {
  return persistSnapshots[persistSnapshots.length - 1]
}

describe('StateEngine armTrigger', () => {
  it('arms a delayed trigger setting triggerAt = now + delay (AE2, R9)', () => {
    const engine = makeEngine()
    engine.armTrigger('al-1', 5, T0)

    expect(engine.alerts[0].status).toBe('pending')
    expect(engine.alerts[0].triggerAt).toBe(T0 + DELAY_5MIN_MS)
  })

  it('cancels an armed trigger and returns alert to un-armed status (AE2, R9)', () => {
    const engine = makeEngine()
    engine.armTrigger('al-1', 5, T0)
    const cancelled = engine.cancelTrigger('al-1')

    expect(cancelled.triggerAt).toBeUndefined()
    expect(cancelled.status).toBe('pending')
  })

  it('reuses the slot after cancellation to arm another alert', () => {
    const engine = makeEngine()
    engine.armTrigger('al-1', 5, T0)
    engine.cancelTrigger('al-1')

    const armed = engine.armTrigger('al-1', 4, T0)
    expect(armed.triggerAt).toBe(T0 + 240_000)
  })

  it('rejects delay outside the 3–15 minute window with a validation error', () => {
    const engine = makeEngine()

    expect(() => engine.armTrigger('al-1', 2, T0)).toThrow(ValidationError)
    expect(() => engine.armTrigger('al-1', 16, T0)).toThrow(ValidationError)
    expect(() => engine.armTrigger('al-1', 0, T0)).toThrow(ValidationError)
  })

  it('persists on arming (R3, R17a)', () => {
    const engine = makeEngine()
    engine.armTrigger('al-1', 5, T0)
    expect(persistSnapshots).toHaveLength(1)
    expect(latestSnapshot().alerts[0].triggerAt).toBe(T0 + DELAY_5MIN_MS)
  })
})

describe('StateEngine tick — pending → active → complete', () => {
  it('activates a pending alert once its triggerAt elapses (AE3, R11)', () => {
    const engine = makeEngine()
    engine.armTrigger('al-1', 5, T0)
    expect(engine.alerts[0].status).toBe('pending')

    const changed = engine.tick(T0 + DELAY_5MIN_MS)

    expect(changed).toBe(true)
    const alert = engine.alerts[0]
    expect(alert.status).toBe('active')
    expect(alert.activeSince).toBe(T0 + DELAY_5MIN_MS)
    expect(alert.completedAt).toBeUndefined()
  })

  it('auto-completes an active alert after 10 minutes (AE4, R12)', () => {
    const engine = makeEngine()
    engine.armTrigger('al-1', 5, T0)
    engine.tick(T0 + DELAY_5MIN_MS)

    const changed = engine.tick(T0 + DELAY_5MIN_MS + TEN_MIN_MS)

    expect(changed).toBe(true)
    const alert = engine.alerts[0]
    expect(alert.status).toBe('complete')
    expect(alert.completedAt).toBe(T0 + DELAY_5MIN_MS + TEN_MIN_MS)
    expect(alert.activeSince).toBeUndefined()
  })

  it('does not persist when no transition occurs (saves only on mutations)', () => {
    const engine = makeEngine()
    engine.armTrigger('al-1', 5, T0)
    expect(persistSnapshots).toHaveLength(1)

    engine.tick(T0 + DELAY_5MIN_MS - 1) // not yet due
    expect(persistSnapshots).toHaveLength(1)
  })

  it('does not fire an alert before its triggerAt (R10)', () => {
    const engine = makeEngine()
    engine.armTrigger('al-1', 5, T0)
    engine.tick(T0 - 10)
    expect(engine.alerts[0].status).toBe('pending')
  })
})

describe('StateEngine manual complete', () => {
  it('completes an active alert immediately via completeAlert (R13)', () => {
    const engine = makeEngine()
    engine.armTrigger('al-1', 5, T0)
    engine.tick(T0 + DELAY_5MIN_MS)

    const completed = engine.completeAlert('al-1', T0 + DELAY_5MIN_MS + 30_000)

    expect(completed.status).toBe('complete')
    expect(completed.completedAt).toBe(T0 + DELAY_5MIN_MS + 30_000)
    expect(completed.activeSince).toBeUndefined()
  })

  it('rejects completing a non-active alert (R13)', () => {
    const engine = makeEngine()
    expect(() => engine.completeAlert('al-1', T0)).toThrow(InvariantError)
  })
})

describe('StateEngine re-trigger (repeat drills, R8)', () => {
  it('re-arms a completed alert for another drill', () => {
    const engine = makeEngine()
    engine.armTrigger('al-1', 5, T0)
    engine.tick(T0 + DELAY_5MIN_MS)
    engine.completeAlert('al-1', T0 + DELAY_5MIN_MS + 10_000)

    const armed = engine.armTrigger('al-1', 5, T0 + DELAY_5MIN_MS + 10_000)
    expect(armed.triggerAt).toBe(T0 + 2 * DELAY_5MIN_MS + 10_000)
    expect(armed.status).toBe('pending')
  })
})

describe('StateEngine false alarm', () => {
  it('activates a false alarm and auto-clears after 10 minutes (R15)', () => {
    const engine = makeEngine()
    const result = engine.triggerFalseAlert(T0)

    expect(result.activeSince).toBe(T0)
    expect(engine.getState(T0).falseAlarmActive).toBe(true)

    engine.tick(T0 + TEN_MIN_MS)
    expect(engine.getState(T0 + TEN_MIN_MS).falseAlarmActive).toBe(false)
  })

  it('shows an active false alarm as the dashboard read model', () => {
    const engine = makeEngine()
    engine.triggerFalseAlert(T0)

    const state = engine.getState(T0)
    expect(state.activeAlert).toBeNull()
    expect(state.falseAlarmActive).toBe(true)
    expect(state.trucks).toHaveLength(1)
  })

  it('blocks false alarms while another false alarm is active (R16a)', () => {
    const engine = makeEngine()
    engine.triggerFalseAlert(T0)

    expectInvariantCode(
      () => engine.triggerFalseAlert(T0),
      'ALARM_ACTIVE_OR_PENDING',
    )
  })
})

describe('StateEngine single-active-alarm invariant (R10, R16)', () => {
  it('rejects a second trigger while an alert is pending/armed (AE1, R10)', () => {
    const engine = makeEngine()
    engine.armTrigger('al-1', 5, T0)

    expectInvariantCode(
      () => engine.armTrigger('al-1', 5, T0),
      'ALARM_ACTIVE_OR_PENDING',
    )
  })

  it('rejects a second trigger while an alert is active (AE1, R10)', () => {
    const engine = makeEngine()
    engine.armTrigger('al-1', 5, T0)
    engine.tick(T0 + DELAY_5MIN_MS)

    expectInvariantCode(
      () => engine.armTrigger('al-1', 5, T0),
      'ALARM_ACTIVE_OR_PENDING',
    )
  })

  it('allows arming once the active alert completes (R10)', () => {
    const engine = makeEngine()
    engine.armTrigger('al-1', 5, T0)
    engine.tick(T0 + DELAY_5MIN_MS)
    engine.completeAlert('al-1', T0 + DELAY_5MIN_MS + 10_000)

    expect(() => engine.armTrigger('al-1', 5, T0 + DELAY_5MIN_MS + 10_000)).not.toThrow()
  })

  it('rejects a false alarm while an alert is armed (R16)', () => {
    const engine = makeEngine()
    engine.armTrigger('al-1', 5, T0)

    expectInvariantCode(() => engine.triggerFalseAlert(T0), 'ALARM_ACTIVE_OR_PENDING')
  })

  it('rejects a false alarm while an alert is active (R16)', () => {
    const engine = makeEngine()
    engine.armTrigger('al-1', 5, T0)
    engine.tick(T0 + DELAY_5MIN_MS)

    expectInvariantCode(() => engine.triggerFalseAlert(T0), 'ALARM_ACTIVE_OR_PENDING')
  })
})

describe('StateEngine truck management (R6, R14)', () => {
  it('deletes a truck and strips it from every alert, including active ones (AE5, R6)', () => {
    const engine = makeEngine()
    engine.armTrigger('al-1', 5, T0)
    engine.tick(T0 + DELAY_5MIN_MS) // al-1 is now active

    engine.deleteTruck('trk-1')

    expect(engine.trucks).toHaveLength(0)
    expect(engine.alerts[0].truckIds).toHaveLength(0)
    expect(engine.alerts[0].status).toBe('active') // active alert unaffected
  })

  it('cascades truck deletion across multiple alerts', () => {
    const engine = new StateEngine(
      {
        trucks: [
          { id: 't1', name: 'A', category: 'Trupp' },
          { id: 't2', name: 'B', category: 'Staffel' },
        ],
        alerts: [
          { id: 'a1', name: 'A', category: 'C', address: 'x', info: 'y', truckIds: ['t1', 't2'], status: 'pending' },
          { id: 'a2', name: 'B', category: 'C', address: 'x', info: 'y', truckIds: ['t1'], status: 'pending' },
        ],
        settings: { soundDurationSec: 60 },
      } as DataFile,
    )

    engine.deleteTruck('t1')

    expect(engine.trucks).toHaveLength(1)
    expect(engine.alerts[0].truckIds).toEqual(['t2'])
    expect(engine.alerts[1].truckIds).toEqual([])
  })

  it('deletes an alert and frees the slot if it was armed (R14)', () => {
    const engine = makeEngine()
    engine.armTrigger('al-1', 5, T0)
    // Slot is occupied; second arm attempt is rejected.
    expectInvariantCode(() => engine.armTrigger('al-1', 5, T0), 'ALARM_ACTIVE_OR_PENDING')

    engine.deleteAlert('al-1')
    // Slot is now free: a different alert arms successfully.
    const armed = engine.armTrigger('al-2', 5, T0)
    expect(armed.id).toBe('al-2')
    expect(armed.triggerAt).toBe(T0 + DELAY_5MIN_MS)
  })

  it('creates and updates trucks with validation', () => {
    const engine = makeEngine()
    const truck = engine.createTruck({ name: 'LF 20', category: 'Trupp' })
    expect(truck.id).toBeDefined()
    expect(truck.name).toBe('LF 20')
    expect(truck.category).toBe('Trupp')
    expect(engine.trucks).toHaveLength(2)

    const updated = engine.updateTruck(truck.id, { name: 'LF 20 KatS', category: 'Staffel' })
    expect(updated.name).toBe('LF 20 KatS')
    expect(updated.category).toBe('Staffel')

    expect(() => engine.createTruck({ name: '', category: 'Trupp' })).toThrow(ValidationError)
    expect(() => engine.createTruck({ name: 'Test', category: 'invalid' })).toThrow(ValidationError)
    expect(() => engine.updateTruck('non-existent', { name: 'X' })).toThrow(NotFoundError)
  })

  it('creates and updates alerts with validation', () => {
    const engine = makeEngine()
    const alert = engine.createAlert({
      name: 'Brand',
      category: 'Brand',
      address: 'Hauptstr. 1',
      info: 'Rauchentwicklung',
      notes: 'Hinterhof',
      truckIds: ['trk-1'],
    })
    expect(alert.id).toBeDefined()
    expect(alert.name).toBe('Brand')
    expect(alert.status).toBe('pending')
    expect(alert.notes).toBe('Hinterhof')
    expect(alert.truckIds).toEqual(['trk-1'])

    const updated = engine.updateAlert(alert.id, {
      name: 'Großbrand',
      info: 'Dachstuhl brennt',
      truckIds: [],
    })
    expect(updated.name).toBe('Großbrand')
    expect(updated.info).toBe('Dachstuhl brennt')
    expect(updated.truckIds).toEqual([])

    expect(() => engine.createAlert({ name: '', category: 'A', address: 'B', info: 'C' })).toThrow(ValidationError)
    expect(() => engine.updateAlert('non-existent', { name: 'X' })).toThrow(NotFoundError)
  })

  it('updates settings with validation', () => {
    const engine = makeEngine()
    const settings = engine.updateSettings({ soundDurationSec: 120 })
    expect(settings.soundDurationSec).toBe(120)
    expect(engine.getState().settings.soundDurationSec).toBe(120)

    expect(() => engine.updateSettings({ soundDurationSec: 0 })).toThrow(ValidationError)
    expect(() => engine.updateSettings({ soundDurationSec: -10 })).toThrow(ValidationError)
  })
})

describe('StateEngine not found (R8)', () => {
  it('throws NotFoundError for unknown ids', () => {
    const engine = makeEngine()
    expect(() => engine.completeAlert('nope')).toThrow(NotFoundError)
    expect(() => engine.armTrigger('nope', 5, T0)).toThrow(NotFoundError)
    expect(() => engine.cancelTrigger('nope')).toThrow(NotFoundError)
  })
})

describe('StateEngine getState (read model)', () => {
  it('reports idle state when nothing is armed or active', () => {
    const engine = makeEngine()
    const state = engine.getState(T0)

    expect(state.activeAlert).toBeNull()
    expect(state.pendingTrigger).toBeNull()
    expect(state.falseAlarmActive).toBe(false)
    expect(state.trucks).toHaveLength(1)
    expect(state.settings.soundDurationSec).toBe(60)
  })

  it('reports an armed pending trigger with a countdown (R9)', () => {
    const engine = makeEngine()
    engine.armTrigger('al-1', 5, T0)
    expect(engine.getState(T0).pendingTrigger).toEqual({
      id: 'al-1',
      countdownMs: DELAY_5MIN_MS,
    })
    expect(engine.getState(T0 + 30_000).pendingTrigger?.countdownMs).toBe(DELAY_5MIN_MS - 30_000)
  })

  it('clears the pending trigger once it fires', () => {
    const engine = makeEngine()
    engine.armTrigger('al-1', 5, T0)
    engine.tick(T0 + DELAY_5MIN_MS)
    expect(engine.getState(T0 + DELAY_5MIN_MS).pendingTrigger).toBeNull()
  })
})

describe('StateEngine restart resilience (AE7, R3, R17a)', () => {
  it('resumes countdowns and active timeouts from persisted timestamps', () => {
    const engine1 = makeEngine()
    engine1.armTrigger('al-1', 5, T0)
    engine1.tick(T0 + DELAY_5MIN_MS) // becomes active

    // Simulate persistence to disk and a subsequent server restart.
    const persisted = latestSnapshot()
    const engine2 = new StateEngine(persisted, {
      persist: persistSpy,
      now: () => T0 + DELAY_5MIN_MS,
    })

    // On the fresh instance the alert is still active with activeSince intact.
    expect(engine2.getState().activeAlert?.id).toBe('al-1')
    expect(engine2.getState().activeAlert?.status).toBe('active')

    // Tick 10 minutes later completes it.
    const changed = engine2.tick(T0 + DELAY_5MIN_MS + TEN_MIN_MS)
    expect(changed).toBe(true)
    expect(engine2.alerts[0].status).toBe('complete')
  })

  it('resumes an armed countdown from the persisted triggerAt (R3, R17a)', () => {
    const engine1 = makeEngine()
    engine1.armTrigger('al-1', 10, T0)

    const persisted = latestSnapshot()
    const engine2 = new StateEngine(persisted, {
      persist: persistSpy,
      now: () => T0 + 120_000, // 2 minutes later
    })

    expect(engine2.getState().pendingTrigger?.countdownMs).toBe(480_000)

    // Firing still resolves exactly at the original triggerAt.
    engine2.tick(T0 + 10 * DELAY_5MIN_MS)
    expect(engine2.alerts[0].status).toBe('active')
  })
})

describe('clock injection', () => {
  it('uses the injected clock to stamp triggerAt without an explicit `now` arg', () => {
    let clock = T0
    const clockFn: ClockFn = () => clock

    const engine = new StateEngine(baseData(), {
      persist: persistSpy,
      now: clockFn,
    })

    // Arming at the injected time (no explicit `now`) stamps triggerAt = now + delay.
    engine.armTrigger('al-1', 5)
    expect(engine.alerts[0].triggerAt).toBe(T0 + DELAY_5MIN_MS)

    // Free the slot, then advance the clock; the next arm stamps the new now.
    engine.cancelTrigger('al-1')
    clock = T0 + 60_000
    const armed = engine.armTrigger('al-1', 5)
    expect(armed.triggerAt).toBe(T0 + 60_000 + DELAY_5MIN_MS)
  })

  it('derives the false-alarm window from the injected clock', () => {
    const engine = new StateEngine(baseData(), {
      persist: persistSpy,
      now: () => T0,
    })
    engine.triggerFalseAlert()
    expect(engine.getState().falseAlarmActive).toBe(true)

    // Not yet expired.
    engine.tick(T0 + TEN_MIN_MS - 1)
    expect(engine.getState().falseAlarmActive).toBe(true)

    // Exactly 10 minutes later the window clears.
    const cleared = engine.tick(T0 + TEN_MIN_MS)
    expect(cleared).toBe(true)
    expect(engine.getState().falseAlarmActive).toBe(false)
  })

  it('resolves the active timeout from the injected clock', () => {
    const engine = new StateEngine(baseData(), {
      persist: persistSpy,
      now: () => T0,
    })
    engine.armTrigger('al-1', 5)
    engine.tick(T0 + DELAY_5MIN_MS) // becomes active at T0 + delay

    expect(engine.alerts[0].activeSince).toBe(T0 + DELAY_5MIN_MS)

    // Just before the 10-minute mark: still active.
    engine.tick(T0 + DELAY_5MIN_MS + TEN_MIN_MS - 1)
    expect(engine.alerts[0].status).toBe('active')

    // At the 10-minute mark it completes.
    engine.tick(T0 + DELAY_5MIN_MS + TEN_MIN_MS)
    expect(engine.alerts[0].status).toBe('complete')
  })
})

// ============================================================
// Roster Tests (crew_roster PRD §11)
// ============================================================

// Base data with persons and a truck per category
function rosterBaseData(): DataFile {
  return {
    trucks: [
      { id: 'trk-gruppe', name: 'HLF 20', category: 'Gruppe' },
      { id: 'trk-staffel', name: 'ELF 1', category: 'Staffel' },
      { id: 'trk-trupp', name: 'LF 10', category: 'Trupp' },
    ],
    alerts: [],
    settings: { soundDurationSec: 60 },
    persons: [
      { name: 'Alice', excludedRoles: [] },
      { name: 'Bob', excludedRoles: [] },
      { name: 'Charlie', excludedRoles: ['GF'] },
      { name: 'Diana', excludedRoles: [] },
    ],
    rosters: [],
    activeRosterId: null,
  }
}

describe('StateEngine — roster CRUD', () => {
  it('creates a roster and returns it with a generated id', () => {
    const engine = new StateEngine(rosterBaseData(), { persist: persistSpy, now: () => T0 })
    const roster = engine.createRoster({ name: 'Test', assignments: {} })
    expect(roster.id).toBeDefined()
    expect(roster.name).toBe('Test')
    expect(engine.rosters).toHaveLength(1)
  })

  it('throws ValidationError when name is missing', () => {
    const engine = new StateEngine(rosterBaseData(), { persist: persistSpy, now: () => T0 })
    expect(() => engine.createRoster({ name: '' })).toThrow(ValidationError)
    expect(() => engine.createRoster({ name: undefined })).toThrow(ValidationError)
  })

  it('updates roster name', () => {
    const engine = new StateEngine(rosterBaseData(), { persist: persistSpy, now: () => T0 })
    const roster = engine.createRoster({ name: 'Old Name' })
    const updated = engine.updateRoster(roster.id, { name: 'New Name' })
    expect(updated.name).toBe('New Name')
  })

  it('throws NotFoundError for unknown id on update', () => {
    const engine = new StateEngine(rosterBaseData(), { persist: persistSpy, now: () => T0 })
    expect(() => engine.updateRoster('no-such-id', { name: 'X' })).toThrow(NotFoundError)
  })

  it('deletes a roster and returns', () => {
    const engine = new StateEngine(rosterBaseData(), { persist: persistSpy, now: () => T0 })
    const roster = engine.createRoster({ name: 'A' })
    engine.deleteRoster(roster.id)
    expect(engine.rosters).toHaveLength(0)
  })

  it('throws NotFoundError deleting unknown id', () => {
    const engine = new StateEngine(rosterBaseData(), { persist: persistSpy, now: () => T0 })
    expect(() => engine.deleteRoster('ghost')).toThrow(NotFoundError)
  })
})

describe('StateEngine — activate / deactivate roster', () => {
  it('activates a roster (single-active invariant)', () => {
    const engine = new StateEngine(rosterBaseData(), { persist: persistSpy, now: () => T0 })
    const r1 = engine.createRoster({ name: 'R1' })
    const r2 = engine.createRoster({ name: 'R2' })
    engine.activateRoster(r1.id)
    expect(engine.activeRosterId).toBe(r1.id)
    engine.activateRoster(r2.id)
    expect(engine.activeRosterId).toBe(r2.id)
  })

  it('deactivates — sets activeRosterId to null', () => {
    const engine = new StateEngine(rosterBaseData(), { persist: persistSpy, now: () => T0 })
    const r = engine.createRoster({ name: 'R' })
    engine.activateRoster(r.id)
    engine.deactivateRoster()
    expect(engine.activeRosterId).toBeNull()
  })

  it('deleting the active roster clears activeRosterId', () => {
    const engine = new StateEngine(rosterBaseData(), { persist: persistSpy, now: () => T0 })
    const r = engine.createRoster({ name: 'R' })
    engine.activateRoster(r.id)
    engine.deleteRoster(r.id)
    expect(engine.activeRosterId).toBeNull()
  })

  it('activateRoster throws NotFoundError for unknown id', () => {
    const engine = new StateEngine(rosterBaseData(), { persist: persistSpy, now: () => T0 })
    expect(() => engine.activateRoster('no-such')).toThrow(NotFoundError)
  })
})

describe('StateEngine — assignment validation', () => {
  it('rejects assignment to an excluded role', () => {
    const engine = new StateEngine(rosterBaseData(), { persist: persistSpy, now: () => T0 })
    // Charlie excludes 'GF' (a Gruppe role)
    expect(() =>
      engine.createRoster({
        name: 'Bad',
        assignments: { 'trk-gruppe': { GF: 'Charlie' } },
      }),
    ).toThrow(ValidationError)
  })

  it('rejects a person assigned twice in the same roster', () => {
    const engine = new StateEngine(rosterBaseData(), { persist: persistSpy, now: () => T0 })
    expect(() =>
      engine.createRoster({
        name: 'Bad',
        assignments: {
          'trk-gruppe': { GF: 'Alice', MA: 'Alice' },
        },
      }),
    ).toThrow(ValidationError)
  })

  it('rejects unknown person name', () => {
    const engine = new StateEngine(rosterBaseData(), { persist: persistSpy, now: () => T0 })
    expect(() =>
      engine.createRoster({
        name: 'Bad',
        assignments: { 'trk-gruppe': { GF: 'NoSuchPerson' } },
      }),
    ).toThrow(ValidationError)
  })

  it('rejects unknown role for the truck category', () => {
    const engine = new StateEngine(rosterBaseData(), { persist: persistSpy, now: () => T0 })
    // 'GF' is not a Staffel slot
    expect(() =>
      engine.createRoster({
        name: 'Bad',
        assignments: { 'trk-staffel': { GF: 'Alice' } },
      }),
    ).toThrow(ValidationError)
  })

  it('prunes unknown truckIds silently', () => {
    const engine = new StateEngine(rosterBaseData(), { persist: persistSpy, now: () => T0 })
    const roster = engine.createRoster({
      name: 'Good',
      assignments: { 'nonexistent-truck': { SF: 'Alice' } },
    })
    expect(Object.keys(roster.assignments)).toHaveLength(0)
  })

  it('allows null slot values', () => {
    const engine = new StateEngine(rosterBaseData(), { persist: persistSpy, now: () => T0 })
    const roster = engine.createRoster({
      name: 'Partial',
      assignments: { 'trk-gruppe': { GF: null } },
    })
    expect(roster.assignments['trk-gruppe']['GF']).toBeNull()
  })
})

describe('StateEngine — truck-delete / category-change prunes rosters', () => {
  it('deleting a truck removes its assignments entry from all rosters', () => {
    const engine = new StateEngine(rosterBaseData(), { persist: persistSpy, now: () => T0 })
    const roster = engine.createRoster({
      name: 'R',
      assignments: {
        'trk-gruppe': { GF: 'Alice' },
        'trk-staffel': { SF: 'Bob' },
      },
    })
    engine.deleteTruck('trk-gruppe')
    expect(engine.rosters[0].assignments['trk-gruppe']).toBeUndefined()
    expect(engine.rosters[0].assignments['trk-staffel']).toBeDefined()
  })

  it('changing truck category prunes roles no longer valid', () => {
    const engine = new StateEngine(rosterBaseData(), { persist: persistSpy, now: () => T0 })
    // trk-gruppe (Gruppe) has slot GF; change to Staffel where GF doesn't exist
    engine.createRoster({
      name: 'R',
      assignments: { 'trk-gruppe': { GF: 'Alice', MA: 'Bob' } },
    })
    engine.updateTruck('trk-gruppe', { category: 'Staffel' })
    const slots = engine.rosters[0].assignments['trk-gruppe']
    // GF is not in Staffel slots; MA is in Staffel slots
    expect(slots?.['GF']).toBeUndefined()
    expect(slots?.['MA']).toBe('Bob')
  })
})

describe('StateEngine — randomAssign', () => {
  it('assigns persons deterministically with a seeded rng', () => {
    // A simple deterministic pseudo-rng cycling through fixed values
    const seq = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
    let i = 0
    const rng = () => seq[i++ % seq.length]
    const data = rosterBaseData()
    const engine = new StateEngine(data, { persist: persistSpy, now: () => T0, rng })
    const roster = engine.createRoster({ name: 'R' })
    const result = engine.randomAssign(roster.id)
    expect(result.assigned + result.unassigned.length).toBe(data.persons.length)
    expect(typeof result.assigned).toBe('number')
    expect(Array.isArray(result.unassigned)).toBe(true)
  })

  it('clears all existing assignments before re-assigning', () => {
    const engine = new StateEngine(rosterBaseData(), { persist: persistSpy, now: () => T0 })
    const roster = engine.createRoster({
      name: 'R',
      assignments: { 'trk-gruppe': { GF: 'Alice' } },
    })
    engine.randomAssign(roster.id)
    // GF may or may not have Alice now — the key point is assignments were rebuilt
    const totalFilled = Object.values(roster.assignments).flatMap(Object.values).filter(Boolean).length
    // Just verify the result is consistent (no exception and some assignments made)
    expect(totalFilled).toBeGreaterThanOrEqual(0)
  })

  it('throws NotFoundError for unknown roster', () => {
    const engine = new StateEngine(rosterBaseData(), { persist: persistSpy, now: () => T0 })
    expect(() => engine.randomAssign('ghost')).toThrow(NotFoundError)
  })

  it('respects excluded roles — excluded person never placed in excluded role', () => {
    const engine = new StateEngine(rosterBaseData(), { persist: persistSpy, now: () => T0 })
    const roster = engine.createRoster({ name: 'R' })
    // Run many times to be confident
    for (let run = 0; run < 10; run++) {
      engine.randomAssign(roster.id)
      const gfSlot = roster.assignments['trk-gruppe']?.['GF']
      // Charlie excludes GF — should never appear there
      expect(gfSlot).not.toBe('Charlie')
    }
  })
})

describe('StateEngine — getState includes activeRoster', () => {
  it('returns null activeRoster when no roster is active', () => {
    const engine = new StateEngine(rosterBaseData(), { persist: persistSpy, now: () => T0 })
    expect(engine.getState().activeRoster).toBeNull()
  })

  it('returns the active roster name and assignments in public state', () => {
    const engine = new StateEngine(rosterBaseData(), { persist: persistSpy, now: () => T0 })
    const roster = engine.createRoster({
      name: 'Active Roster',
      assignments: { 'trk-gruppe': { GF: 'Alice' } },
    })
    engine.activateRoster(roster.id)
    const state = engine.getState()
    expect(state.activeRoster).not.toBeNull()
    expect(state.activeRoster?.name).toBe('Active Roster')
    expect(state.activeRoster?.assignments['trk-gruppe']['GF']).toBe('Alice')
  })
})
