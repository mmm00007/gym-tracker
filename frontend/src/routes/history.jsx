import HistoryScreen from '../screens/HistoryScreen'
import { mc } from '../App'
import { useAppRouteContext } from './useAppRouteContext'

export default function HistoryRoute() {
  const {
    machines,
    navigateHome,
    trainingBuckets,
  } = useAppRouteContext()

  return (
    <HistoryScreen
      trainingBuckets={trainingBuckets}
      machines={machines}
      onBack={navigateHome}
      getMuscleColor={mc}
    />
  )
}
