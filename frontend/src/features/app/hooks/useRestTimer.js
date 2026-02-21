import { useEffect, useState } from 'react'

const REST_TIMER_ENABLED_STORAGE_KEY = 'gym-tracker.rest-timer-enabled'

export function useRestTimer({ isActiveRoute, sets, storageKey = REST_TIMER_ENABLED_STORAGE_KEY }) {
  const [restTimerEnabled, setRestTimerEnabled] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(storageKey) === 'true'
  })
  const [restTimerLastSetAtMs, setRestTimerLastSetAtMs] = useState(null)
  const [restTimerSeconds, setRestTimerSeconds] = useState(0)

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(storageKey, String(restTimerEnabled))
  }, [restTimerEnabled, storageKey])

  useEffect(() => {
    if (!Array.isArray(sets) || !sets.length) {
      setRestTimerLastSetAtMs(null)
      return
    }

    const latestSetTimestamp = sets.reduce((latest, set) => {
      const loggedAt = new Date(set.logged_at).getTime()
      if (Number.isNaN(loggedAt)) return latest
      return loggedAt > latest ? loggedAt : latest
    }, 0)

    setRestTimerLastSetAtMs((previousTimestamp) => (
      previousTimestamp === latestSetTimestamp ? previousTimestamp : latestSetTimestamp || null
    ))
  }, [sets])

  useEffect(() => {
    const restTimerUiActive = restTimerEnabled && isActiveRoute
    if (!restTimerLastSetAtMs || !restTimerUiActive) {
      setRestTimerSeconds(0)
      return undefined
    }

    const tick = () => {
      setRestTimerSeconds(Math.max(0, Math.floor((Date.now() - restTimerLastSetAtMs) / 1000)))
    }

    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [isActiveRoute, restTimerEnabled, restTimerLastSetAtMs])

  return {
    restTimerEnabled,
    setRestTimerEnabled,
    restTimerLastSetAtMs,
    setRestTimerLastSetAtMs,
    restTimerSeconds,
  }
}
