import { PlanScreen } from '../App'
import { useAppRouteContext } from './useAppRouteContext'

export default function PlansRoute() {
  const {
    machines,
    navigateHome,
    plansEnabled,
    sets,
  } = useAppRouteContext()
  if (!plansEnabled) return null

  return (
    <PlanScreen
      machines={machines}
      sets={sets}
      onBack={navigateHome}
    />
  )
}
