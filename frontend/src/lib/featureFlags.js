import { API_BASE_URL } from './api'

const DEFAULT_FLAGS = Object.freeze({
  setCentricLogging: false,
  libraryScreenEnabled: false,
  analysisOnDemandOnly: false,
})

const ENV_FLAG_MAP = Object.freeze({
  setCentricLogging: import.meta.env.VITE_SET_CENTRIC_LOGGING,
  libraryScreenEnabled: import.meta.env.VITE_LIBRARY_SCREEN_ENABLED,
  analysisOnDemandOnly: import.meta.env.VITE_ANALYSIS_ON_DEMAND_ONLY,
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
    }
  } catch {
    return withEnvDefaults(DEFAULT_FLAGS)
  } finally {
    clearTimeout(timeoutId)
  }
}

export { DEFAULT_FLAGS }
