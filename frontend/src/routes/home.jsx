import { useEffect, useMemo, useState } from 'react'
import { HomeScreen } from '../App'
import { signOut } from '../lib/supabase'
import { useAppRouteContext } from './useAppRouteContext'

export default function HomeRoute() {
  const [dismissedSorenessBucketIds, setDismissedSorenessBucketIds] = useState(() => new Set())
  const {
    dayStartHour,
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
    user,
    weightedMuscleProfileWorkloadEnabled,
  } = useAppRouteContext()

  useEffect(() => {
    if (!user?.id) {
      setDismissedSorenessBucketIds(new Set())
      return
    }

    setDismissedSorenessBucketIds((previousDismissed) => {
      if (!previousDismissed.size) return previousDismissed
      const pendingBucketIds = new Set(pendingSoreness.map((session) => session.training_bucket_id))
      const nextDismissed = new Set([...previousDismissed].filter((bucketId) => pendingBucketIds.has(bucketId)))
      return nextDismissed.size === previousDismissed.size ? previousDismissed : nextDismissed
    })
  }, [pendingSoreness, user?.id])

  const visiblePendingSoreness = useMemo(
    () => pendingSoreness.filter((session) => !dismissedSorenessBucketIds.has(session.training_bucket_id)),
    [dismissedSorenessBucketIds, pendingSoreness],
  )

  const handleSorenessDismiss = (trainingBucketId) => {
    if (!trainingBucketId) return
    setDismissedSorenessBucketIds((previousDismissed) => {
      if (previousDismissed.has(trainingBucketId)) return previousDismissed
      const nextDismissed = new Set(previousDismissed)
      nextDismissed.add(trainingBucketId)
      return nextDismissed
    })
  }

  return (
    <HomeScreen
      pendingSoreness={visiblePendingSoreness}
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
