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
