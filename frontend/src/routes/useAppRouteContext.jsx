import { createContext, useContext } from 'react'

const AppRouteContext = createContext(null)

export function AppRouteContextProvider({ value, children }) {
  return (
    <AppRouteContext.Provider value={value}>
      {children}
    </AppRouteContext.Provider>
  )
}

export function useAppRouteContext() {
  const context = useContext(AppRouteContext)
  if (!context) {
    throw new Error('useAppRouteContext must be used within AppRouteContextProvider')
  }
  return context
}
