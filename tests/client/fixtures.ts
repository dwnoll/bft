import type { Alert, PublicState, Truck } from '../../src/shared/types'

export const trucks: Truck[] = [
  { id: 't1', name: 'ELF 1', category: 'Staffel' },
  { id: 't2', name: 'HLF 20', category: 'Gruppe' },
  { id: 't3', name: 'LF 10', category: 'Trupp' },
  { id: 't4', name: 'TLF 16', category: 'Trupp' },
  { id: 't5', name: 'DLK 23', category: 'Staffel' },
]

export const activeAlert: Alert = {
  id: 'a1',
  name: 'Wohnungsbrand',
  category: 'Wohnungsbrand',
  address: 'Musterstraße 5',
  info: 'Brandgeruch in Wohneinheit',
  notes: 'Schlüssel beim Nachbarn',
  truckIds: ['t1', 't2'],
  status: 'active',
  activeSince: 1000,
}

export function makeState(overrides: Partial<PublicState> = {}): PublicState {
  return {
    activeAlert: null,
    falseAlarmActive: false,
    trucks,
    settings: { soundDurationSec: 60 },
    pendingTrigger: null,
    ...overrides,
  }
}

export function mockFetchState(getState: () => PublicState) {
  const fn = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => getState(),
  }))
  vi.stubGlobal('fetch', fn)
  return fn
}

// Minimal HTMLAudioElement stand-in recording playback calls.
export class FakeAudio {
  static instances: FakeAudio[] = []
  src: string
  loop = false
  currentTime = 0
  play = vi.fn(async () => undefined)
  pause = vi.fn()
  constructor(src?: string) {
    this.src = src ?? ''
    FakeAudio.instances.push(this)
  }
}
