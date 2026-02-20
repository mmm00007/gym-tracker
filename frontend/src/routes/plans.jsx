import { useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { PlanScreen } from '../App'
import { addLog } from '../lib/logs'
import { APP_SCREEN_TO_PATH } from '../app/routeConfig'
import { useAppRouteContext } from './useAppRouteContext'

export default function PlansRoute() {
  const {
    featureFlagsLoading,
    machines,
    navigateHome,
    plansEnabled,
    sets,
  } = useAppRouteContext()
  const navigate = useNavigate()

  useEffect(() => {
    if (featureFlagsLoading || plansEnabled) return
    addLog({ level: 'warn', event: 'feature_flags.plans_fallback', message: 'Plans screen disabled; redirecting to home.' })
    navigate({ to: APP_SCREEN_TO_PATH.home, replace: true })
  }, [featureFlagsLoading, navigate, plansEnabled])

  if (!plansEnabled) return null

  return (
    <PlanScreen
      machines={machines}
      sets={sets}
      onBack={navigateHome}
    />
  )
}
