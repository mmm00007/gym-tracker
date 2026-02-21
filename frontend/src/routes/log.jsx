import { useCallback } from 'react'
import { LogSetScreen } from '../App'
import { useRestTimer } from '../features/app/hooks'
import { useAppRouteContext } from './useAppRouteContext'

export default function LogRoute() {
  const {
    dayStartHour,
    favoritesOrderingEnabled,
    libraryEnabled,
    loadMachineHistory,
    machineHistory,
    machines,
    navigateHome,
    navigateLibrary,
    handleDeleteSet,
    handleLogSet,
    setCentricLoggingEnabled,
    sets,
  } = useAppRouteContext()

  const {
    restTimerEnabled,
    restTimerLastSetAtMs,
    restTimerSeconds,
    setRestTimerEnabled,
    setRestTimerLastSetAtMs,
  } = useRestTimer({
    isActiveRoute: true,
    sets,
  })

  const handleLogSetWithRestTimer = useCallback(async (...args) => {
    const loggedSet = await handleLogSet(...args)
    const loggedAtMs = new Date(loggedSet?.logged_at ?? Date.now()).getTime()
    setRestTimerLastSetAtMs(Number.isNaN(loggedAtMs) ? Date.now() : loggedAtMs)
  }, [handleLogSet, setRestTimerLastSetAtMs])

  return (
    <LogSetScreen
      sets={sets}
      machines={machines}
      machineHistory={machineHistory}
      onLoadMachineHistory={loadMachineHistory}
      onLogSet={handleLogSetWithRestTimer}
      onDeleteSet={handleDeleteSet}
      onBack={navigateHome}
      onOpenLibrary={navigateLibrary}
      libraryEnabled={libraryEnabled}
      dayStartHour={dayStartHour}
      setCentricLoggingEnabled={setCentricLoggingEnabled}
      favoritesOrderingEnabled={favoritesOrderingEnabled}
      restTimerEnabled={restTimerEnabled}
      onSetRestTimerEnabled={setRestTimerEnabled}
      restTimerSeconds={restTimerSeconds}
      restTimerLastSetAtMs={restTimerLastSetAtMs}
    />
  )
}
