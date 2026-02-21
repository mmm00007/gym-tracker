import { AnalysisScreen } from '../App'
import { useAppRouteContext } from './useAppRouteContext'

export default function AnalysisRoute() {
  const {
    analysisOnDemandOnly,
    loadMachineHistory,
    machineHistory,
    machines,
    navigateHome,
    sorenessHistory,
    trainingBuckets,
  } = useAppRouteContext()

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
