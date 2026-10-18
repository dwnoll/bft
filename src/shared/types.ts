// Shared domain types used by both the server and the client.
// These types are the contract between the backend state engine/routes
// and the frontend UI.

export type AlertStatus = 'pending' | 'active' | 'complete'

export interface Truck {
  id: string
  name: string
  seats: number
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
