import { ulid } from 'ulid'
import type { Alert, AlertStatus, DataFile, Settings, Truck } from './types'

// --- Authentication (R4, D2) ---
export const DEFAULT_ADMIN_USER = 'ffw_bft'
export const DEFAULT_ADMIN_PASS = 'bft_2026'
export const ADMIN_AUTH_REALM = 'Firealarm Simulator Admin'

// --- Lifecycle timing (R3, R17a, R11, R12, R15) ---
export const TICK_INTERVAL_MS = 1000
export const ALERT_ACTIVE_SECONDS = 600 // 10 minutes
export const AUTO_COMPLETE_MS = ALERT_ACTIVE_SECONDS * 1000
export const FALSE_ALARM_MS = AUTO_COMPLETE_MS // false alarm auto-clears after 10 min

// --- Delayed trigger window (R9) ---
export const MIN_DELAY_MINUTES = 3
export const MAX_DELAY_MINUTES = 15

// --- Seed data (PRD §11) ---
export function seedTrucks(): Truck[] {
  return [
    { id: ulid(), name: 'ELF 1', seats: 2 },
    { id: ulid(), name: 'HLF 20', seats: 5 },
    { id: ulid(), name: 'LF 10', seats: 4 },
    { id: ulid(), name: 'TLF 16', seats: 5 },
    { id: ulid(), name: 'DLK 23', seats: 5 },
  ]
}

export function seedAlerts(trucks: Truck[]): Alert[] {
  const elf = trucks.find((t) => t.name === 'ELF 1')
  const hlf = trucks.find((t) => t.name === 'HLF 20')
  const tlf = trucks.find((t) => t.name === 'TLF 16')
  if (!elf || !hlf || !tlf) {
    throw new Error('seedAlerts: expected trucks "ELF 1", "HLF 20", "TLF 16" — check seedTrucks()')
  }
  return [
    {
      id: ulid(),
      name: 'Wohnungsbrand',
      category: 'Wohnungsbrand',
      address: 'Musterstraße 5',
      info: 'Brandgeruch in Wohneinheit',
      truckIds: [elf.id, hlf.id],
      status: 'pending' as AlertStatus,
    },
    {
      id: ulid(),
      name: 'THL B3',
      category: 'Technische Hilfeleistung',
      address: 'B3, km 12',
      info: 'Pannenfahrzeug auf Standspur',
      truckIds: [hlf.id, tlf.id],
      status: 'pending' as AlertStatus,
    },
  ]
}

export function seedSettings(): Settings {
  return { soundDurationSec: 60 }
}

export function defaultDataFile(): DataFile {
  const trucks = seedTrucks()
  return {
    trucks,
    alerts: seedAlerts(trucks),
    settings: seedSettings(),
  }
}
