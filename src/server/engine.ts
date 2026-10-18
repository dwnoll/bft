import type { Alert, DataFile, PendingTrigger, PublicState, Truck } from '../shared/types'
import {
  AUTO_COMPLETE_MS,
  MAX_DELAY_MINUTES,
  MIN_DELAY_MINUTES,
} from '../shared/constants'

export const ALARM_ACTIVE_OR_PENDING = 'ALARM_ACTIVE_OR_PENDING'

// Typed domain errors. The Express layer maps `code` to HTTP status:
//   'ALARM_ACTIVE_OR_PENDING' -> 409
//   'NOT_FOUND'               -> 404
//   'BAD_REQUEST'             -> 400
export class EngineError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = 'EngineError'
  }
}

export class NotFoundError extends EngineError {
  constructor(id: string) {
    super('NOT_FOUND', `No entity found for id "${id}"`)
  }
}

export class InvariantError extends EngineError {
  constructor(code: string, message: string) {
    super(code, message)
  }
}

export class ValidationError extends EngineError {
  constructor(message: string) {
    super('BAD_REQUEST', message)
  }
}

export type PersistFn = (data: DataFile) => Promise<void>
export type ClockFn = () => number

export interface StateEngineOptions {
  persist: PersistFn
  now: ClockFn
}

export const DEFAULT_STATE_ENGINE_OPTIONS: StateEngineOptions = {
  persist: async () => {},
  now: () => Date.now(),
}

/**
 * Pure domain state machine driving the alert lifecycle and the single-active
 * invariant. It owns the in-memory DataFile (and the in-memory false-alarm
 * window) and persists on every mutation through the injected PersistFn.
 *
 * All time-based decisions use an injected clock so behaviour is deterministic
 * and fully testable (PRD §2, R3, R10, R11, R12, R15).
 */
export class StateEngine {
  private readonly _options: StateEngineOptions
  private data: DataFile
  // In-memory only (never persisted): the one-shot false-alarm drill window.
  private falseAlarmActiveSince: number | null = null

  constructor(data: DataFile, options: StateEngineOptions = DEFAULT_STATE_ENGINE_OPTIONS) {
    this._options = options
    this.data = data
  }

  get trucks(): Truck[] {
    return this.data.trucks
  }

  get alerts(): Alert[] {
    return this.data.alerts
  }

  // --- helpers ---------------------------------------------------------------

  private findAlert(id: string): Alert {
    const alert = this.data.alerts.find((a) => a.id === id)
    if (!alert) {
      throw new NotFoundError(id)
    }
    return alert
  }

  private schedulePersist(): void {
    try {
      // Fire-and-forget: state is already mutated synchronously. A rejected
      // persist must never crash the request/tick that triggered it.
      void this._options.persist(this.data).catch((err: unknown) => {
        console.error('Error persisting state:', err)
      })
    } catch (err) {
      console.error('Error scheduling state persist:', err)
    }
  }

  private currentNow(): number {
    return this._options.now()
  }

  /** Enforces the single-active-alarm invariant across alerts and false alarm. */
  private isSlotTaken(): boolean {
    if (this.falseAlarmActiveSince !== null) {
      return true
    }
    return this.data.alerts.some(
      (a) => a.status === 'active' || a.triggerAt !== undefined,
    )
  }

  // --- delayed trigger -------------------------------------------------------

  /**
   * Arm a delayed trigger on `alertId`. Validates the 3–15 minute window and the
   * single-alarm invariant. Returns the armed alert carrying `triggerAt`.
   */
  armTrigger(alertId: string, delayMinutes: number, now?: number): Alert {
    const alert = this.findAlert(alertId)
    const n = now ?? this.currentNow()
    const delayMs = delayMinutes * 60_000

    if (!Number.isInteger(delayMinutes)) {
      throw new ValidationError('Delay minutes must be an integer')
    }
    if (delayMinutes < MIN_DELAY_MINUTES || delayMinutes > MAX_DELAY_MINUTES) {
      throw new ValidationError(
        `Delay must be between ${MIN_DELAY_MINUTES} and ${MAX_DELAY_MINUTES} minutes`,
      )
    }
    if (this.isSlotTaken()) {
      throw new InvariantError(ALARM_ACTIVE_OR_PENDING, 'Alarm aktiv oder ausstehend')
    }

    alert.status = 'pending'
    alert.triggerAt = n + delayMs
    this.schedulePersist()
    return alert
  }

  /**
   * Cancel an armed trigger, returning the alert to its pre-arming status.
   * Frees the one-alarm slot for another alert.
   */
  cancelTrigger(alertId: string): Alert {
    const alert = this.findAlert(alertId)
    alert.triggerAt = undefined
    // An alert should only be cancellable while armed, but guard the transition.
    if (alert.status === 'active') {
      alert.status = 'pending'
    }
    this.schedulePersist()
    return alert
  }

  // --- tick loop -------------------------------------------------------------

  /**
   * Evaluate time-based transitions at `now`. Pure state transitions; the
   * caller persists once dirty. Returns whether any transition occurred.
   */
  tick(now?: number): boolean {
    const n = now ?? this.currentNow()
    let changed = false

    // Pending -> Active (delay elapsed)
    for (const alert of this.data.alerts) {
      if (alert.status !== 'pending' || alert.triggerAt === undefined) {
        continue
      }
      if (alert.triggerAt <= n) {
        alert.status = 'active'
        alert.activeSince = n
        // The armed window has elapsed; the alert is no longer pending.
        alert.triggerAt = undefined
        alert.completedAt = undefined
        changed = true
      }
    }

    // Active -> Complete (10-minute auto timeout)
    for (const alert of this.data.alerts) {
      if (alert.status !== 'active' || alert.activeSince === undefined) {
        continue
      }
      if (alert.activeSince + AUTO_COMPLETE_MS <= n) {
        alert.status = 'complete'
        alert.completedAt = n
        alert.activeSince = undefined
        changed = true
      }
    }

    // False alarm auto-clear (10-minute window)
    if (this.falseAlarmActiveSince !== null &&
        this.falseAlarmActiveSince + AUTO_COMPLETE_MS <= n) {
      this.falseAlarmActiveSince = null
      changed = true
    }

    if (changed) {
      this.schedulePersist()
    }
    return changed
  }

  // --- manual actions --------------------------------------------------------

  /** Manually complete an active alert. */
  completeAlert(alertId: string, now?: number): Alert {
    const alert = this.findAlert(alertId)
    if (alert.status !== 'active') {
      throw new InvariantError('ALERT_NOT_ACTIVE', 'Alarm ist nicht aktiv')
    }
    const n = now ?? this.currentNow()
    alert.status = 'complete'
    alert.completedAt = n
    alert.activeSince = undefined
    alert.triggerAt = undefined
    this.schedulePersist()
    return alert
  }

  /** Trigger a one-shot false alarm. Rejects if the slot is occupied. */
  triggerFalseAlert(now?: number): { activeSince: number } {
    if (this.isSlotTaken()) {
      throw new InvariantError(ALARM_ACTIVE_OR_PENDING, 'Alarm aktiv oder ausstehend')
    }
    const n = now ?? this.currentNow()
    this.falseAlarmActiveSince = n
    this.schedulePersist()
    return { activeSince: n }
  }

  // --- management ------------------------------------------------------------

  /** Remove a truck and silently strip it from every alert's truckIds. */
  deleteTruck(truckId: string): Truck[] {
    this.data.trucks = this.data.trucks.filter((t) => t.id !== truckId)
    for (const alert of this.data.alerts) {
      alert.truckIds = alert.truckIds.filter((id) => id !== truckId)
    }
    this.schedulePersist()
    return this.data.trucks
  }

  /** Remove an alert. Deleting an armed alert frees the one-alarm slot. */
  deleteAlert(alertId: string): Alert[] {
    this.data.alerts = this.data.alerts.filter((a) => a.id !== alertId)
    this.schedulePersist()
    return this.data.alerts
  }

  // --- read model ------------------------------------------------------------

  /** Public dashboard payload (no authentication). */
  getState(now?: number): PublicState {
    const n = now ?? this.currentNow()
    const active = this.data.alerts.find((a) => a.status === 'active') ?? null
    const pending = this.data.alerts.find((a) => a.triggerAt !== undefined)
    const pendingTrigger: PendingTrigger | null = pending
      ? { id: pending.id, countdownMs: Math.max(0, pending.triggerAt! - n) }
      : null

    return {
      activeAlert: active,
      falseAlarmActive: this.falseAlarmActiveSince !== null,
      trucks: this.data.trucks,
      settings: this.data.settings,
      pendingTrigger,
    }
  }
}
