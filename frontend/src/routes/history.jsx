import HistoryScreen from '../screens/HistoryScreen'
import { mc } from '../App'
import { useTrainingBuckets } from '../features/data/hooks'
import { useAppRouteContext } from './useAppRouteContext'

export default function HistoryRoute() {
  const {
    machines,
    navigateHome,
    sets,
  } = useAppRouteContext()

  const trainingBuckets = useTrainingBuckets({ sets, machines })

  return (
    <HistoryScreen
      trainingBuckets={trainingBuckets}
      machines={machines}
      onBack={navigateHome}
      getMuscleColor={mc}
    />
  )
}
