import { LogSetScreen } from '../App'
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
    restTimerEnabled,
    restTimerLastSetAtMs,
    restTimerSeconds,
    setCentricLoggingEnabled,
    setRestTimerEnabled,
    sets,
  } = useAppRouteContext()

  return (
    <LogSetScreen
      sets={sets}
      machines={machines}
      machineHistory={machineHistory}
      onLoadMachineHistory={loadMachineHistory}
      onLogSet={handleLogSet}
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
