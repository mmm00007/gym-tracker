import { AnalysisScreen } from '../App'
import { useAppRouteContext } from './useAppRouteContext'

export default function AnalysisRoute() {
  const {
    analysisInitialTab,
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
      initialTab={analysisInitialTab}
      analysisOnDemandOnly={analysisOnDemandOnly}
      trainingBuckets={trainingBuckets}
      sorenessHistory={sorenessHistory}
    />
  )
}
