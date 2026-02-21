import { PlanScreen } from '../App'
import { useAppRouteContext } from './useAppRouteContext'

export default function PlansRoute() {
  const {
    machines,
    navigateHome,
    sets,
  } = useAppRouteContext()

  return (
    <PlanScreen
      machines={machines}
      sets={sets}
      onBack={navigateHome}
    />
  )
}
