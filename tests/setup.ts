import '@testing-library/jest-dom/vitest'

// Newer Node versions ship an experimental global `localStorage` that can
// shadow jsdom's implementation (and be undefined without a backing file).
// Install a plain in-memory Storage for client tests when that happens.
if (typeof window !== 'undefined' && typeof globalThis.localStorage?.clear !== 'function') {
  const store = new Map<string, string>()
  const memoryStorage: Storage = {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => Array.from(store.keys())[index] ?? null,
    removeItem: (key) => void store.delete(key),
    setItem: (key, value) => void store.set(key, String(value)),
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: memoryStorage,
    configurable: true,
    writable: true,
  })
}

// jsdom does not implement PointerEvent. dnd-kit (and pointer-drag tests)
// rely on events exposing clientX/clientY, which the plain `Event` constructor
// drops. Provide a minimal PointerEvent backed by MouseEvent when missing so
// `fireEvent.pointerDown/Move/Up` produce events dnd-kit can read coordinates
// from.
if (typeof window !== 'undefined' && typeof window.PointerEvent !== 'function') {
  const PointerEventPolyfill = class PointerEvent extends (window.MouseEvent as typeof MouseEvent) {
    pointerId: number
    pointerType: string
    pressure: number
    width: number
    height: number
    tiltX: number
    tiltY: number
    twist: number
    isPrimary: boolean
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 0
      this.pointerType = init.pointerType ?? 'mouse'
      this.pressure = init.pressure ?? 0
      this.width = init.width ?? 0
      this.height = init.height ?? 0
      this.tiltX = init.tiltX ?? 0
      this.tiltY = init.tiltY ?? 0
      this.twist = init.twist ?? 0
      // dnd-kit's PointerSensor activation handler requires isPrimary === true
      this.isPrimary = init.isPrimary ?? true
    }
  }
  ;(window as unknown as Record<string, unknown>).PointerEvent = PointerEventPolyfill
}
