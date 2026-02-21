import { LibraryScreen } from '../App'
import { useAppRouteContext } from './useAppRouteContext'

export default function LibraryRoute() {
  const {
    fixedOptionMachineTaxonomyEnabled,
    handleDeleteMachine,
    handleSaveMachine,
    machineAutofillEnabled,
    machineRatingEnabled,
    machines,
    navigateHome,
    pinnedFavoritesEnabled,
  } = useAppRouteContext()

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
