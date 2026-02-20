import React from 'react'
import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import App from '../App'

export const rootRoute = createRootRoute({
  component: () => <Outlet />,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: App,
})

export const routeTree = rootRoute.addChildren([indexRoute])

export const router = createRouter({
  routeTree,
})
