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
    trucks: [{ id: 'trk-1', name: 'ELF 1', seats: 2 }],
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
          { id: 't1', name: 'A', seats: 2 },
          { id: 't2', name: 'B', seats: 5 },
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
