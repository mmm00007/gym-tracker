import { DiagnosticsScreen } from '../App'
import { useAppRouteContext } from './useAppRouteContext'

export default function DiagnosticsRoute() {
  const {
    machines,
    navigateHome,
    refreshData,
    user,
  } = useAppRouteContext()

  return (
    <DiagnosticsScreen
      user={user}
      machines={machines}
      onBack={navigateHome}
      onDataRefresh={refreshData}
    />
  )
}
