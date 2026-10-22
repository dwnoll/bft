// Shared domain types used by both the server and the client.
// These types are the contract between the backend state engine/routes
// and the frontend UI.

export type AlertStatus = 'pending' | 'active' | 'complete'

export type TruckCategory = 'Gruppe' | 'Staffel' | 'Trupp'

export interface Truck {
  id: string
  name: string
  category: TruckCategory
}

export interface Alert {
  id: string
  name: string
  category: string
  address: string
  info: string
  notes?: string
  truckIds: string[]
  status: AlertStatus
  // Optional map position (decimal degrees). When both are present a map can be
  // derived from the position (or from the address). null means "no position".
  lat?: number | null
  lng?: number | null
  // Map zoom level, integer 14-17 (see shared/constants ZOOM_LABELS). Always a
  // valid value; omits default to DEFAULT_ZOOM (15).
  zoom?: number
  // epoch ms; set when a delayed trigger is armed
  triggerAt?: number
  // epoch ms; set when the alert goes active
  activeSince?: number
  // epoch ms; set when the alert completes
  completedAt?: number
}

export interface Settings {
  soundDurationSec: number
}

export interface DataFile {
  trucks: Truck[]
  alerts: Alert[]
  settings: Settings
}

// Public dashboard payload returned by GET /api/state.
export interface PendingTrigger {
  id: string
  // time (ms) until the armed trigger fires
  countdownMs: number
}

export interface PublicState {
  activeAlert: Alert | null
  falseAlarmActive: boolean
  trucks: Truck[]
  settings: Settings
  pendingTrigger: PendingTrigger | null
}
