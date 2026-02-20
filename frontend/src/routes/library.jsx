import { useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { LibraryScreen } from '../App'
import { addLog } from '../lib/logs'
import { APP_SCREEN_TO_PATH } from '../app/routeConfig'
import { useAppRouteContext } from './useAppRouteContext'

export default function LibraryRoute() {
  const {
    featureFlagsLoading,
    fixedOptionMachineTaxonomyEnabled,
    handleDeleteMachine,
    handleSaveMachine,
    libraryEnabled,
    machineAutofillEnabled,
    machineRatingEnabled,
    machines,
    navigateHome,
    pinnedFavoritesEnabled,
  } = useAppRouteContext()
  const navigate = useNavigate()

  useEffect(() => {
    if (featureFlagsLoading || libraryEnabled) return
    addLog({ level: 'warn', event: 'feature_flags.library_fallback', message: 'Library screen disabled; redirecting to home.' })
    navigate({ to: APP_SCREEN_TO_PATH.home, replace: true })
  }, [featureFlagsLoading, libraryEnabled, navigate])

  if (!libraryEnabled) return null

  return (
    <LibraryScreen
      machines={machines}
      onSaveMachine={handleSaveMachine}
      onDeleteMachine={handleDeleteMachine}
      onBack={navigateHome}
      machineRatingEnabled={machineRatingEnabled}
      pinnedFavoritesEnabled={pinnedFavoritesEnabled}
      machineAutofillEnabled={machineAutofillEnabled}
      fixedOptionMachineTaxonomyEnabled={fixedOptionMachineTaxonomyEnabled}
    />
  )
}
