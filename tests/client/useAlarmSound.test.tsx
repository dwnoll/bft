import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAlarmSound, SOUND_STORAGE_KEY } from '../../src/client/hooks/useAlarmSound'
import { FakeAudio } from './fixtures'

beforeEach(() => {
  FakeAudio.instances = []
  localStorage.clear()
  vi.stubGlobal('Audio', FakeAudio)
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function setup(initialKey: string | null, durationSec = 60) {
  return renderHook(
    ({ activeKey }: { activeKey: string | null }) => useAlarmSound(activeKey, durationSec),
    { initialProps: { activeKey: initialKey } },
  )
}

describe('useAlarmSound', () => {
  it('defaults to disabled when nothing is stored', () => {
    const { result } = setup(null)
    expect(result.current.enabled).toBe(false)
  })

  it('persists the preference in localStorage and restores it on remount (AE6)', () => {
    const first = setup(null)
    act(() => first.result.current.setEnabled(true))
    expect(localStorage.getItem(SOUND_STORAGE_KEY)).toBe('true')
    first.unmount()

    const second = setup(null)
    expect(second.result.current.enabled).toBe(true)
  })

  it('stays silent on transition to active when sound is off (R18)', () => {
    const { rerender } = setup(null)
    rerender({ activeKey: 'a1' })
    expect(FakeAudio.instances.every((a) => a.play.mock.calls.length === 0)).toBe(true)
  })

  it('plays looped audio on transition to active when sound is on (R17)', () => {
    localStorage.setItem(SOUND_STORAGE_KEY, 'true')
    const { rerender } = setup(null)
    rerender({ activeKey: 'a1' })
    expect(FakeAudio.instances).toHaveLength(1)
    const audio = FakeAudio.instances[0]
    expect(audio.src).toContain('/sound/Warnung.mp3')
    expect(audio.loop).toBe(true)
    expect(audio.play).toHaveBeenCalledTimes(1)
  })

  it('stops after soundDurationSec', () => {
    localStorage.setItem(SOUND_STORAGE_KEY, 'true')
    const { rerender } = setup(null, 30)
    rerender({ activeKey: 'a1' })
    const audio = FakeAudio.instances[0]
    act(() => {
      vi.advanceTimersByTime(29_000)
    })
    expect(audio.pause).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    expect(audio.pause).toHaveBeenCalledTimes(1)
  })

  it('stops immediately when the alarm ends', () => {
    localStorage.setItem(SOUND_STORAGE_KEY, 'true')
    const { rerender } = setup('a1')
    const audio = FakeAudio.instances[0]
    rerender({ activeKey: null })
    expect(audio.pause).toHaveBeenCalled()
  })

  it('stops when the user switches sound off during playback', () => {
    localStorage.setItem(SOUND_STORAGE_KEY, 'true')
    const { result } = setup('a1')
    const audio = FakeAudio.instances[0]
    act(() => result.current.setEnabled(false))
    expect(audio.pause).toHaveBeenCalled()
  })

  it('starts when the user enables sound while an alarm is already active', () => {
    const { result } = setup('a1')
    expect(FakeAudio.instances).toHaveLength(0)
    act(() => result.current.setEnabled(true))
    expect(FakeAudio.instances[0].play).toHaveBeenCalledTimes(1)
  })

  it('does not restart for the same alert on re-render', () => {
    localStorage.setItem(SOUND_STORAGE_KEY, 'true')
    const { rerender } = setup('a1')
    rerender({ activeKey: 'a1' })
    expect(FakeAudio.instances).toHaveLength(1)
    expect(FakeAudio.instances[0].play).toHaveBeenCalledTimes(1)
  })

  it('tolerates a rejected play() (browser autoplay policy)', async () => {
    localStorage.setItem(SOUND_STORAGE_KEY, 'true')
    class RejectingAudio extends FakeAudio {
      override play = vi.fn(async () => {
        throw new Error('NotAllowedError')
      })
    }
    vi.stubGlobal('Audio', RejectingAudio)
    expect(() => setup('a1')).not.toThrow()
    await vi.advanceTimersByTimeAsync(0)
  })
})
