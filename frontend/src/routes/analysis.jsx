import { AnalysisScreen } from '../App'
import { useTrainingBuckets } from '../features/data/hooks'
import { useAppRouteContext } from './useAppRouteContext'

export default function AnalysisRoute() {
  const {
    analysisOnDemandOnly,
    loadMachineHistory,
    machineHistory,
    machines,
    navigateHome,
    sets,
    sorenessHistory,
  } = useAppRouteContext()

  const trainingBuckets = useTrainingBuckets({ sets, machines })

  return (
    <AnalysisScreen
      machines={machines}
      machineHistory={machineHistory}
      onLoadMachineHistory={loadMachineHistory}
      onBack={navigateHome}
      initialTab="run"
      analysisOnDemandOnly={analysisOnDemandOnly}
      trainingBuckets={trainingBuckets}
      sorenessHistory={sorenessHistory}
    />
  )
}
