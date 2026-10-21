import { ulid } from 'ulid'
import type { Alert, DataFile, PendingTrigger, PublicState, Settings, Truck, TruckCategory } from '../shared/types'
import {
  AUTO_COMPLETE_MS,
  DEFAULT_ZOOM,
  MAX_DELAY_MINUTES,
  MAX_LATITUDE,
  MAX_LONGITUDE,
  MAX_ZOOM,
  MIN_DELAY_MINUTES,
  MIN_LATITUDE,
  MIN_LONGITUDE,
  MIN_ZOOM,
  TRUCK_CATEGORIES,
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

  get settings(): Settings {
    return this.data.settings
  }

  // --- helpers ---------------------------------------------------------------

  /**
   * Validate an optional manual coordinate ("lat, lng") and/or a zoom level.
   * Throws ValidationError with a human-facing message on the first problem.
   */
  private validateLocation(
    lat: unknown,
    lng: unknown,
    zoom: unknown,
  ): { lat: number | null; lng: number | null; zoom: number } {
    // Zoom: when supplied it must be an integer within the supported range.
    let resolvedZoom: number
    if (zoom !== undefined) {
      const z = typeof zoom === 'number' ? zoom : Number(zoom)
      if (!Number.isInteger(z) || z < MIN_ZOOM || z > MAX_ZOOM) {
        throw new ValidationError(
          `Zoom muss eine ganze Zahl zwischen ${MIN_ZOOM} und ${MAX_ZOOM} sein`,
        )
      }
      resolvedZoom = z
    } else {
      // No zoom supplied: default to the canonical value.
      resolvedZoom = DEFAULT_ZOOM
    }

    // Coordinates: when supplied they must be two numbers within the valid ranges.
    let resolvedLat: number | null = null
    let resolvedLng: number | null = null
    if (lat !== undefined || lng !== undefined) {
      const parsed = this.parseCoordinate(lat, lng)
      if (parsed) {
        resolvedLat = parsed.lat
        resolvedLng = parsed.lng
        if (
          resolvedLat < MIN_LATITUDE ||
          resolvedLat > MAX_LATITUDE ||
          resolvedLng < MIN_LONGITUDE ||
          resolvedLng > MAX_LONGITUDE
        ) {
          throw new ValidationError(
            'Koordinaten liegen außerhalb des gültigen Bereichs',
          )
        }
      }
    }

    return { lat: resolvedLat, lng: resolvedLng, zoom: resolvedZoom }
  }

  private parseCoordinate(
    lat: unknown,
    lng: unknown,
  ): { lat: number; lng: number } | null {
    // Exactly two numeric values, separated by a comma, optional whitespace.
    if (lat === undefined || lng === undefined) return null
    if (typeof lat !== 'number' || typeof lng !== 'number') return null
    if (lat !== lat || lng !== lng) return null // NaN check
    return { lat, lng }
  }

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
      // An alert occupies the slot when it is active, or when it is pending with
      // an armed trigger. A pending alert without triggerAt does NOT occupy the
      // slot — this prevents orphaned triggerAt values from permanently blocking.
      (a) => a.status === 'active' || (a.status === 'pending' && a.triggerAt !== undefined),
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

    // Validate before computing derived values so NaN/undefined never reaches triggerAt.
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

    const delayMs = delayMinutes * 60_000
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
    if (alert.status !== 'pending' || alert.triggerAt === undefined) {
      throw new InvariantError('ALERT_NOT_ARMED', 'Alarm ist nicht ausgelöst')
    }
    alert.triggerAt = undefined
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

  private validateCategory(value: unknown): TruckCategory {
    if (typeof value === 'string' && (TRUCK_CATEGORIES as readonly string[]).includes(value)) {
      return value as TruckCategory
    }
    throw new ValidationError(`Truck category must be one of ${TRUCK_CATEGORIES.join(', ')}`)
  }

  /** Create a new truck (PRD §5). */
  createTruck(input: { name?: unknown; category?: unknown }): Truck {
    if (typeof input.name !== 'string' || input.name.trim().length === 0) {
      throw new ValidationError('Truck name is required and cannot be empty')
    }
    const category = this.validateCategory(input.category)
    const truck: Truck = {
      id: ulid(),
      name: input.name.trim(),
      category,
    }
    this.data.trucks.push(truck)
    this.schedulePersist()
    return truck
  }

  /** Update an existing truck by id (PRD §5). */
  updateTruck(id: string, input: { name?: unknown; category?: unknown }): Truck {
    const truck = this.data.trucks.find((t) => t.id === id)
    if (!truck) {
      throw new NotFoundError(id)
    }
    if (input.name !== undefined) {
      if (typeof input.name !== 'string' || input.name.trim().length === 0) {
        throw new ValidationError('Truck name cannot be empty')
      }
      truck.name = input.name.trim()
    }
    if (input.category !== undefined) {
      truck.category = this.validateCategory(input.category)
    }
    this.schedulePersist()
    return truck
  }

  /** Remove a truck and silently strip it from every alert's truckIds. */
  deleteTruck(truckId: string): Truck[] {
    const exists = this.data.trucks.some((t) => t.id === truckId)
    if (!exists) {
      throw new NotFoundError(truckId)
    }
    this.data.trucks = this.data.trucks.filter((t) => t.id !== truckId)
    for (const alert of this.data.alerts) {
      alert.truckIds = alert.truckIds.filter((id) => id !== truckId)
    }
    this.schedulePersist()
    return this.data.trucks
  }

  /** Create a planned alert (PRD §6). */
  createAlert(input: {
    name?: unknown
    category?: unknown
    address?: unknown
    info?: unknown
    notes?: unknown
    truckIds?: unknown
    lat?: unknown
    lng?: unknown
    zoom?: unknown
  }): Alert {
    if (typeof input.name !== 'string' || input.name.trim().length === 0) {
      throw new ValidationError('Alert name is required and cannot be empty')
    }
    if (typeof input.category !== 'string' || input.category.trim().length === 0) {
      throw new ValidationError('Alert category is required and cannot be empty')
    }
    if (typeof input.address !== 'string' || input.address.trim().length === 0) {
      throw new ValidationError('Alert address is required and cannot be empty')
    }
    if (typeof input.info !== 'string' || input.info.trim().length === 0) {
      throw new ValidationError('Alert info is required and cannot be empty')
    }
    if (input.truckIds !== undefined && !Array.isArray(input.truckIds)) {
      throw new ValidationError('truckIds must be an array')
    }

    const truckIds: string[] = Array.isArray(input.truckIds)
      ? input.truckIds.filter((id): id is string => typeof id === 'string')
      : []

    const notes =
      typeof input.notes === 'string' && input.notes.trim().length > 0
        ? input.notes.trim()
        : undefined

    // Validate + normalize the optional position/zoom.
    const { lat, lng, zoom } = this.validateLocation(input.lat, input.lng, input.zoom)

    const alert: Alert = {
      id: ulid(),
      name: input.name.trim(),
      category: input.category.trim(),
      address: input.address.trim(),
      info: input.info.trim(),
      notes,
      truckIds,
      lat,
      lng,
      zoom,
      status: 'pending',
    }
    this.data.alerts.push(alert)
    this.schedulePersist()
    return alert
  }

  /** Update an existing alert (PRD §6). */
  updateAlert(
    id: string,
    input: {
      name?: unknown
      category?: unknown
      address?: unknown
      info?: unknown
      notes?: unknown
      truckIds?: unknown
      lat?: unknown
      lng?: unknown
      zoom?: unknown
    },
  ): Alert {
    const alert = this.findAlert(id)
    if (input.name !== undefined) {
      if (typeof input.name !== 'string' || input.name.trim().length === 0) {
        throw new ValidationError('Alert name cannot be empty')
      }
      alert.name = input.name.trim()
    }
    if (input.category !== undefined) {
      if (typeof input.category !== 'string' || input.category.trim().length === 0) {
        throw new ValidationError('Alert category cannot be empty')
      }
      alert.category = input.category.trim()
    }
    if (input.address !== undefined) {
      if (typeof input.address !== 'string' || input.address.trim().length === 0) {
        throw new ValidationError('Alert address cannot be empty')
      }
      alert.address = input.address.trim()
    }
    if (input.info !== undefined) {
      if (typeof input.info !== 'string' || input.info.trim().length === 0) {
        throw new ValidationError('Alert info cannot be empty')
      }
      alert.info = input.info.trim()
    }
    if (input.notes !== undefined) {
      alert.notes =
        typeof input.notes === 'string' && input.notes.trim().length > 0
          ? input.notes.trim()
          : undefined
    }
    if (input.truckIds !== undefined) {
      if (!Array.isArray(input.truckIds)) {
        throw new ValidationError('truckIds must be an array')
      }
      alert.truckIds = input.truckIds.filter((tid): tid is string => typeof tid === 'string')
    }

    // Validate the optional position/zoom and only apply when explicitly changed.
    const { lat, lng, zoom } = this.validateLocation(input.lat, input.lng, input.zoom)
    alert.lat = input.lat === undefined ? alert.lat : lat
    alert.lng = input.lng === undefined ? alert.lng : lng
    alert.zoom = input.zoom === undefined ? alert.zoom : zoom

    this.schedulePersist()
    return alert
  }

  /** Remove an alert. Deleting an armed alert frees the one-alarm slot. */
  deleteAlert(alertId: string): Alert[] {
    const exists = this.data.alerts.some((a) => a.id === alertId)
    if (!exists) {
      throw new NotFoundError(alertId)
    }
    this.data.alerts = this.data.alerts.filter((a) => a.id !== alertId)
    this.schedulePersist()
    return this.data.alerts
  }

  /** Update system settings (PRD §9). */
  updateSettings(input: { soundDurationSec?: unknown }): Settings {
    if (input.soundDurationSec !== undefined) {
      const duration =
        typeof input.soundDurationSec === 'number'
          ? input.soundDurationSec
          : Number(input.soundDurationSec)
      if (!Number.isInteger(duration) || duration <= 0) {
        throw new ValidationError('soundDurationSec must be a positive integer')
      }
      this.data.settings.soundDurationSec = duration
      this.schedulePersist()
    }
    return this.data.settings
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
