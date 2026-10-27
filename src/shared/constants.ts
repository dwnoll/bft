import { ulid } from 'ulid'
import type { Alert, AlertStatus, DataFile, Person, Settings, Truck, TruckCategory } from './types'

// --- Truck categories (PRD §5) ---
export const TRUCK_CATEGORIES: TruckCategory[] = ['Gruppe', 'Staffel', 'Trupp']

// --- Crew slot lists per truck category (crew_roster PRD §1) ---
export const CREW_SLOTS: Record<TruckCategory, string[]> = {
  Gruppe: ['GF', 'MA', 'ME', 'ATF', 'ATM', 'WTF', 'WTM', 'STF', 'STM'],
  Staffel: ['SF', 'MA', 'ATF', 'ATM', 'WTF', 'WTM'],
  Trupp: ['MA', 'MF', 'TM'],
}

// --- Lifecycle timing (R3, R17a, R11, R12, R15) ---
export const TICK_INTERVAL_MS = 1000
export const ALERT_ACTIVE_SECONDS = 600 // 10 minutes
export const AUTO_COMPLETE_MS = ALERT_ACTIVE_SECONDS * 1000
export const FALSE_ALARM_MS = AUTO_COMPLETE_MS // false alarm auto-clears after 10 min

// --- Delayed trigger window (R9) ---
export const MIN_DELAY_MINUTES = 3
export const MAX_DELAY_MINUTES = 15

// --- Single-active alarm slot (PRD §1 core rule) ---
// An alert occupies the one-alarm slot when it is active, or when it is
// pending with an armed delayed trigger (triggerAt set). A pending alert
// WITHOUT triggerAt does not occupy the slot — this keeps orphaned triggerAt
// values from permanently blocking the slot. This is the single source of
// truth shared by the engine (invariant check) and storage (integrity sweep),
// so a new slot consumer cannot diverge by reusing a stale copy of the rule.
export function isArmed(alert: Alert): boolean {
  return alert.status === 'pending' && alert.triggerAt !== undefined
}

export function slotOccupied(alert: Alert): boolean {
  return alert.status === 'active' || isArmed(alert)
}

// --- Sound (PRD §9) ---
// Canonical default duration (seconds) the alarm sound plays. Referenced by the
// seed, the client fallbacks, and the settings UI copy so it cannot drift.
export const DEFAULT_SOUND_DURATION_SEC = 60

// --- Location / map view (PRD §2, §6, §11) ---
// Zoom axis rendered as a slider; the four visible stops are labelled with the
// German intensity words. Zoom is stored as the raw integer, defaulting to 15.
export const DEFAULT_ZOOM = 15
export const MIN_ZOOM = 14
export const MAX_ZOOM = 17
export const ZOOM_LABELS: Record<string, string> = {
  '14': 'schwach',
  '15': 'mittel',
  '16': 'stark',
  '17': 'sehr stark',
}

/** Human-readable intensity label for a numeric zoom level (14-17). */
export function zoomLabel(zoom: number): string {
  return ZOOM_LABELS[String(zoom)] ?? String(zoom)
}
// Latitude / longitude bounds used to validate manually entered coordinates.
export const MIN_LATITUDE = -90
export const MAX_LATITUDE = 90
export const MIN_LONGITUDE = -180
export const MAX_LONGITUDE = 180

// --- Seed data (PRD §11) ---
export function seedTrucks(): Truck[] {
  return [
    { id: ulid(), name: 'ELF 1', category: 'Staffel' },
    { id: ulid(), name: 'HLF 20', category: 'Gruppe' },
    { id: ulid(), name: 'LF 10', category: 'Trupp' },
    { id: ulid(), name: 'TLF 16', category: 'Trupp' },
    { id: ulid(), name: 'DLK 23', category: 'Staffel' },
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
      // Seed alerts carry no map position yet (PRD §11: null + 15); the map is
      // derived from the address later.
      lat: null,
      lng: null,
      zoom: DEFAULT_ZOOM,
    },
    {
      id: ulid(),
      name: 'THL B3',
      category: 'Technische Hilfeleistung',
      address: 'B3, km 12',
      info: 'Pannenfahrzeug auf Standspur',
      truckIds: [hlf.id, tlf.id],
      status: 'pending' as AlertStatus,
      lat: null,
      lng: null,
      zoom: DEFAULT_ZOOM,
    },
  ]
}

export function seedSettings(): Settings {
  return { soundDurationSec: DEFAULT_SOUND_DURATION_SEC }
}

export function seedPersons(): Person[] {
  const names = [
    'Berger Anna',
    'Brunner Lukas',
    'Gruber Stefan',
    'Hofer Petra',
    'Kramreiter Jonas',
    'Leitner Sandra',
    'Maier Thomas',
    'Mooslechner Eva',
    'Oberleitner Felix',
    'Pichler Regina',
    'Rabl Markus',
    'Schuster Ingrid',
    'Steiner Wolfgang',
    'Unterberger Katja',
    'Watzke Roland',
    'Zeilinger Miriam',
    'Aigner Paul',
    'Bachmeier Sonja',
    'Fessler Dietmar',
    'Gstrein Verena',
  ]
  return names.map((name) => ({ name, excludedRoles: [] }))
}

export function defaultDataFile(): DataFile {
  const trucks = seedTrucks()
  return {
    trucks,
    alerts: seedAlerts(trucks),
    settings: seedSettings(),
    persons: seedPersons(),
    rosters: [],
    activeRosterId: null,
  }
}
