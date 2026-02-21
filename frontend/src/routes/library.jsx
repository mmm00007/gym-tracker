import { LibraryScreen } from '../App'
import { useAppRouteContext } from './useAppRouteContext'

export default function LibraryRoute() {
  const {
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
