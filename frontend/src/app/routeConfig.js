export const APP_ROUTE_ENTRIES = [
  { id: 'home', screen: 'home', label: 'Home', path: '/' },
  { id: 'log', screen: 'log', label: 'Log', path: '/log' },
  { id: 'library', screen: 'library', label: 'Library', path: '/library' },
  { id: 'history', screen: 'history', label: 'History', path: '/history' },
  { id: 'analysis', screen: 'analysis', label: 'Analysis', path: '/analysis' },
  { id: 'plans', screen: 'plans', label: 'Plans', path: '/plans' },
  { id: 'diagnostics', screen: 'diagnostics', label: 'Diagnostics', path: '/diagnostics' },
]

export const APP_SCREEN_TO_PATH = APP_ROUTE_ENTRIES.reduce((mapping, entry) => {
  mapping[entry.screen] = entry.path
  return mapping
}, {})

export const APP_PATH_TO_SCREEN = APP_ROUTE_ENTRIES.reduce((mapping, entry) => {
  mapping[entry.path] = entry.screen
  return mapping
}, {})
