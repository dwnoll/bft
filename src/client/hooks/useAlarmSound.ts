import { useCallback, useEffect, useRef, useState } from 'react'

export const SOUND_STORAGE_KEY = 'bft.soundEnabled'
export const ALARM_SOUND_URL = '/sound/Warnung.mp3'

function readStoredPreference(): boolean {
  try {
    return localStorage.getItem(SOUND_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export interface AlarmSound {
  enabled: boolean
  setEnabled: (enabled: boolean) => void
}

/**
 * Per-device alarm sound (R17, R18). Plays Warnung.mp3 in a loop while an
 * alarm is active and the device's "Ton" toggle is on, and stops after
 * `durationSec`, when the alarm ends, or when the toggle is switched off.
 *
 * @param activeKey identifies the running alarm (alert id, or a constant for
 *   a false alarm); null when no alarm is active. A new key restarts playback.
 */
export function useAlarmSound(activeKey: string | null, durationSec: number): AlarmSound {
  const [enabled, setEnabledState] = useState<boolean>(readStoredPreference)

  // Duration changes must not restart a sound that is already playing.
  const durationRef = useRef(durationSec)
  durationRef.current = durationSec

  const setEnabled = useCallback((value: boolean) => {
    setEnabledState(value)
    try {
      localStorage.setItem(SOUND_STORAGE_KEY, String(value))
    } catch {
      // Storage unavailable (e.g. private mode): preference lasts for this page only.
    }
  }, [])

  useEffect(() => {
    if (!enabled || activeKey === null) return

    const audio = new Audio(ALARM_SOUND_URL)
    audio.loop = true
    // Browsers may reject autoplay until the user interacted with the page.
    audio.play().catch(() => undefined)
    const stopTimer = setTimeout(() => audio.pause(), durationRef.current * 1000)

    return () => {
      clearTimeout(stopTimer)
      audio.pause()
    }
  }, [enabled, activeKey])

  return { enabled, setEnabled }
}
