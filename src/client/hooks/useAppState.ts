import { useEffect, useState } from 'react'
import type { PublicState } from '../../shared/types'

export const POLL_INTERVAL_MS = 2000

export interface AppStateResult {
  // Last successfully fetched state (kept while the API is unreachable).
  state: PublicState | null
  // Set after a failed poll; cleared by the next successful one.
  error: string | null
}

/**
 * Polls GET /api/state every 2 s (PRD §4). The next request is scheduled only
 * after the previous one settled, so slow networks never cause overlap.
 */
export function useAppState(): AppStateResult {
  const [state, setState] = useState<PublicState | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const controller = new AbortController()

    const poll = async () => {
      try {
        // Per-request 10s timeout so TCP half-open stalls don't permanently
        // block the poll chain. Combines with the unmount AbortController.
        const signal = AbortSignal.any
          ? AbortSignal.any([controller.signal, AbortSignal.timeout(10000)])
          : controller.signal
        const res = await fetch('/api/state', {
          cache: 'no-store',
          signal,
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const next = (await res.json()) as PublicState
        if (cancelled) return
        setState(next)
        setError(null)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Unbekannter Fehler')
      }
      if (!cancelled) timer = setTimeout(poll, POLL_INTERVAL_MS)
    }

    void poll()

    return () => {
      cancelled = true
      controller.abort()
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [])

  return { state, error }
}
