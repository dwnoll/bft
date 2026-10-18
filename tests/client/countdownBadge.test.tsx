import { render, screen } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CountdownBadge } from '../../src/client/components/admin/CountdownBadge'

describe('CountdownBadge', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('formats remaining time correctly (e.g. 4:32)', () => {
    const now = 1000000
    vi.setSystemTime(now)
    const triggerAt = now + (4 * 60 + 32) * 1000 // 4 min 32 sec

    render(<CountdownBadge triggerAt={triggerAt} />)
    expect(screen.getByText('ausstehend (4:32)')).toBeInTheDocument()
  })

  it('updates remaining time every second', () => {
    const now = 1000000
    vi.setSystemTime(now)
    const triggerAt = now + 10 * 1000 // 10 seconds

    render(<CountdownBadge triggerAt={triggerAt} />)
    expect(screen.getByText('ausstehend (0:10)')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(screen.getByText('ausstehend (0:07)')).toBeInTheDocument()
  })

  it('invokes onExpire when countdown reaches 0', () => {
    const now = 1000000
    vi.setSystemTime(now)
    const triggerAt = now + 2000
    const onExpire = vi.fn()

    render(<CountdownBadge triggerAt={triggerAt} onExpire={onExpire} />)
    expect(screen.getByText('ausstehend (0:02)')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(onExpire).toHaveBeenCalled()
  })
})
