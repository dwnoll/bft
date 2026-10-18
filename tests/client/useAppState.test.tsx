import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppState } from '../../src/client/hooks/useAppState'
import { activeAlert, makeState, mockFetchState } from './fixtures'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useAppState', () => {
  it('fetches /api/state immediately and exposes the result', async () => {
    const fetchMock = mockFetchState(() => makeState())
    const { result } = renderHook(() => useAppState())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/state', expect.anything())
    expect(result.current.state?.trucks).toHaveLength(5)
    expect(result.current.error).toBeNull()
  })

  it('polls every 2000 ms and picks up changes', async () => {
    let current = makeState()
    const fetchMock = mockFetchState(() => current)
    const { result } = renderHook(() => useAppState())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    current = makeState({ activeAlert })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.current.state?.activeAlert?.id).toBe('a1')
  })

  it('keeps last known state, reports an error, and recovers on next poll', async () => {
    let fail = false
    const fetchMock = vi.fn(async () => {
      if (fail) throw new Error('network down')
      return { ok: true, status: 200, json: async () => makeState() }
    })
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useAppState())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current.state).not.toBeNull()

    fail = true
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(result.current.error).not.toBeNull()
    expect(result.current.state).not.toBeNull()

    fail = false
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(result.current.error).toBeNull()
  })

  it('treats a non-OK response as an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })),
    )
    const { result } = renderHook(() => useAppState())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current.error).not.toBeNull()
    expect(result.current.state).toBeNull()
  })

  it('stops polling on unmount', async () => {
    const fetchMock = mockFetchState(() => makeState())
    const { unmount } = renderHook(() => useAppState())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    unmount()
    await vi.advanceTimersByTimeAsync(6000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
