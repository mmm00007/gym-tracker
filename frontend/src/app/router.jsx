import React from 'react'
import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import App from '../App'
import { APP_ROUTE_ENTRIES } from './routeConfig'


export const rootRoute = createRootRoute({
  component: () => <Outlet />,
})

const appRoutes = APP_ROUTE_ENTRIES.map((entry) => createRoute({
  id: entry.id,
  getParentRoute: () => rootRoute,
  path: entry.path,
  component: App,
}))

export const routeTree = rootRoute.addChildren(appRoutes)

export const router = createRouter({
  routeTree,
})
