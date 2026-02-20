import React from 'react'
import {
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import App from '../App'
import { APP_ROUTE_ENTRIES } from './routeConfig'
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

const appRoutes = APP_ROUTE_ENTRIES.map((entry) => createRoute({
  id: entry.id,
  getParentRoute: () => rootRoute,
  path: entry.path,
  component: ROUTE_COMPONENTS[entry.screen],
}))

export const routeTree = rootRoute.addChildren(appRoutes)

export const router = createRouter({
  routeTree,
})
