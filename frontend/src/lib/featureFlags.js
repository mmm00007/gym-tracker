import { API_BASE_URL } from './api'

const DEFAULT_FLAGS = Object.freeze({
  setCentricLogging: true,
  libraryScreenEnabled: true,
  analysisOnDemandOnly: true,
  plansEnabled: true,
  favoritesOrderingEnabled: true,
  homeDashboardEnabled: true,
  responsiveUiV2: true,
})

const ENV_FLAG_MAP = Object.freeze({
  setCentricLogging: import.meta.env.VITE_SET_CENTRIC_LOGGING,
  libraryScreenEnabled: import.meta.env.VITE_LIBRARY_SCREEN_ENABLED,
  analysisOnDemandOnly: import.meta.env.VITE_ANALYSIS_ON_DEMAND_ONLY,
  plansEnabled: import.meta.env.VITE_PLANS_ENABLED,
  favoritesOrderingEnabled: import.meta.env.VITE_FAVORITES_ORDERING_ENABLED,
  homeDashboardEnabled: import.meta.env.VITE_HOME_DASHBOARD_ENABLED,
  responsiveUiV2: import.meta.env.VITE_RESPONSIVE_UI_V2,
})

function parseBooleanFlag(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'boolean') return value

  const normalized = String(value).trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallback
}

function withEnvDefaults(baseFlags = DEFAULT_FLAGS) {
  return {
    setCentricLogging: parseBooleanFlag(ENV_FLAG_MAP.setCentricLogging, baseFlags.setCentricLogging),
    libraryScreenEnabled: parseBooleanFlag(ENV_FLAG_MAP.libraryScreenEnabled, baseFlags.libraryScreenEnabled),
    analysisOnDemandOnly: parseBooleanFlag(ENV_FLAG_MAP.analysisOnDemandOnly, baseFlags.analysisOnDemandOnly),
    plansEnabled: parseBooleanFlag(ENV_FLAG_MAP.plansEnabled, baseFlags.plansEnabled),
    favoritesOrderingEnabled: parseBooleanFlag(ENV_FLAG_MAP.favoritesOrderingEnabled, baseFlags.favoritesOrderingEnabled),
    homeDashboardEnabled: parseBooleanFlag(ENV_FLAG_MAP.homeDashboardEnabled, baseFlags.homeDashboardEnabled),
    responsiveUiV2: parseBooleanFlag(ENV_FLAG_MAP.responsiveUiV2, baseFlags.responsiveUiV2),
  }
}

export async function getFeatureFlags() {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 6000)

  try {
    const res = await fetch(`${API_BASE_URL}/api/rollout-flags`, {
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    })

    if (!res.ok) return withEnvDefaults(DEFAULT_FLAGS)

    const envDefaultFlags = withEnvDefaults(DEFAULT_FLAGS)

    const remoteFlags = await res.json()
    return {
      setCentricLogging: parseBooleanFlag(remoteFlags?.setCentricLogging, envDefaultFlags.setCentricLogging),
      libraryScreenEnabled: parseBooleanFlag(remoteFlags?.libraryScreenEnabled, envDefaultFlags.libraryScreenEnabled),
      analysisOnDemandOnly: parseBooleanFlag(remoteFlags?.analysisOnDemandOnly, envDefaultFlags.analysisOnDemandOnly),
      plansEnabled: parseBooleanFlag(remoteFlags?.plansEnabled, envDefaultFlags.plansEnabled),
      favoritesOrderingEnabled: parseBooleanFlag(remoteFlags?.favoritesOrderingEnabled, envDefaultFlags.favoritesOrderingEnabled),
      homeDashboardEnabled: parseBooleanFlag(remoteFlags?.homeDashboardEnabled, envDefaultFlags.homeDashboardEnabled),
      responsiveUiV2: parseBooleanFlag(remoteFlags?.responsiveUiV2, envDefaultFlags.responsiveUiV2),
    }
  } catch {
    return withEnvDefaults(DEFAULT_FLAGS)
  } finally {
    clearTimeout(timeoutId)
  }
}

export { DEFAULT_FLAGS }
