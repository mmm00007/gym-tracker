import { createContext, useContext } from 'react'

/**
 * Stable cross-route contract for shared app state/actions.
 *
 * NOTE: `useAppRouteContext` is the only sanctioned accessor for route modules.
 * Keep this surface minimal and add/remove keys intentionally.
 *
 * @typedef {Object} AppRouteContextValue
 * @property {boolean} analysisOnDemandOnly
 * @property {number} dayStartHour
 * @property {boolean} favoritesOrderingEnabled
 * @property {boolean} fixedOptionMachineTaxonomyEnabled
 * @property {(machineId: string) => Promise<void>} loadMachineHistory
 * @property {(payload: unknown) => Promise<void>} handleLogSet
 * @property {(setId: string) => Promise<void>} handleDeleteSet
 * @property {(machine: unknown) => Promise<void>} handleSaveMachine
 * @property {(machineId: string) => Promise<void>} handleDeleteMachine
 * @property {(payload: unknown) => Promise<void>} handleSorenessSubmit
 * @property {(trainingBucketId: string) => void} handleSorenessDismiss
 * @property {boolean} homeDashboardEnabled
 * @property {boolean} libraryEnabled
 * @property {boolean} machineAutofillEnabled
 * @property {Array<unknown>} machineHistory
 * @property {boolean} machineRatingEnabled
 * @property {Array<unknown>} machines
 * @property {() => void} navigateAnalysis
 * @property {() => void} navigateDiagnostics
 * @property {() => void} navigateHistory
 * @property {() => void} navigateHome
 * @property {() => void} navigateLibrary
 * @property {() => void} navigateLog
 * @property {() => void} navigatePlans
 * @property {Array<unknown>} pendingSoreness
 * @property {boolean} pinnedFavoritesEnabled
 * @property {boolean} plansEnabled
 * @property {() => Promise<void>} refreshData
 * @property {boolean} restTimerEnabled
 * @property {number | null} restTimerLastSetAtMs
 * @property {number} restTimerSeconds
 * @property {boolean} setCentricLoggingEnabled
 * @property {(enabled: boolean) => void} setRestTimerEnabled
 * @property {Array<unknown>} sets
 * @property {Array<unknown>} sorenessHistory
 * @property {Array<unknown>} trainingBuckets
 * @property {unknown} user
 * @property {boolean} weightedMuscleProfileWorkloadEnabled
 */

const AppRouteContext = createContext(null)

/**
 * @param {{ value: AppRouteContextValue, children: import('react').ReactNode }} props
 */
export function AppRouteContextProvider({ value, children }) {
  return (
    <AppRouteContext.Provider value={value}>
      {children}
    </AppRouteContext.Provider>
  )
}

/** @returns {AppRouteContextValue} */
export function useAppRouteContext() {
  const context = useContext(AppRouteContext)
  if (!context) {
    throw new Error('useAppRouteContext must be used within AppRouteContextProvider')
  }
  return context
}
