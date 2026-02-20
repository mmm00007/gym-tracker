import { HomeScreen } from '../App'
import { signOut } from '../lib/supabase'
import { useAppRouteContext } from './useAppRouteContext'

export default function HomeRoute() {
  const {
    dayStartHour,
    handleSorenessDismiss,
    handleSorenessSubmit,
    homeDashboardEnabled,
    libraryEnabled,
    machines,
    navigateAnalysis,
    navigateDiagnostics,
    navigateHistory,
    navigateHome,
    navigateLibrary,
    navigateLog,
    navigatePlans,
    pendingSoreness,
    plansEnabled,
    sets,
    weightedMuscleProfileWorkloadEnabled,
  } = useAppRouteContext()

  return (
    <HomeScreen
      pendingSoreness={pendingSoreness}
      sets={sets}
      machines={machines}
      libraryEnabled={libraryEnabled}
      plansEnabled={plansEnabled}
      homeDashboardEnabled={homeDashboardEnabled}
      weightedMuscleProfileWorkloadEnabled={weightedMuscleProfileWorkloadEnabled}
      dayStartHour={dayStartHour}
      onLogSets={navigateLog}
      onLibrary={navigateLibrary}
      onHistory={navigateHistory}
      onAnalysis={navigateAnalysis}
      onPlans={navigatePlans}
      onDiagnostics={navigateDiagnostics}
      onSorenessSubmit={handleSorenessSubmit}
      onSorenessDismiss={handleSorenessDismiss}
      onSignOut={async () => { await signOut(); navigateHome() }}
    />
  )
}
