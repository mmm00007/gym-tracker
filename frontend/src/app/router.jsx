import React from 'react'
import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router'
import App from '../App'
import { APP_ROUTE_ENTRIES, APP_SCREEN_TO_PATH } from './routeConfig'
import { getQueryClient } from './queryClient'
import { DEFAULT_FLAGS } from '../lib/featureFlags'
import { addLog } from '../lib/logs'
import { getFeatureFlagsQueryOptions } from '../features/data/hooks'
import HomeRoute from '../routes/home'
import LogRoute from '../routes/log'
import LibraryRoute from '../routes/library'
import HistoryRoute from '../routes/history'
import AnalysisRoute from '../routes/analysis'
import PlansRoute from '../routes/plans'
import DiagnosticsRoute from '../routes/diagnostics'

const ROUTE_COMPONENTS = {
  home: HomeRoute,
  log: LogRoute,
  library: LibraryRoute,
  history: HistoryRoute,
  analysis: AnalysisRoute,
  plans: PlansRoute,
  diagnostics: DiagnosticsRoute,
}

export const rootRoute = createRootRoute({
  component: App,
})

const loadFeatureFlags = async () => {
  const queryClient = getQueryClient()
  const flags = await queryClient.ensureQueryData(getFeatureFlagsQueryOptions())

  return flags || DEFAULT_FLAGS
}

const routeGuards = {
  library: async () => {
    const flags = await loadFeatureFlags()
    if (flags.libraryScreenEnabled) return
    addLog({ level: 'warn', event: 'feature_flags.library_fallback', message: 'Library screen disabled; redirecting to home.' })
    throw redirect({ to: APP_SCREEN_TO_PATH.home, replace: true })
  },
  plans: async () => {
    const flags = await loadFeatureFlags()
    if (flags.plansEnabled) return
    addLog({ level: 'warn', event: 'feature_flags.plans_fallback', message: 'Plans screen disabled; redirecting to home.' })
    throw redirect({ to: APP_SCREEN_TO_PATH.home, replace: true })
  },
}

const appRoutes = APP_ROUTE_ENTRIES.map((entry) => createRoute({
  getParentRoute: () => rootRoute,
  path: entry.path,
  component: ROUTE_COMPONENTS[entry.screen],
  beforeLoad: routeGuards[entry.screen],
}))

export const routeTree = rootRoute.addChildren(appRoutes)

export const router = createRouter({
  routeTree,
})
