import { supabase } from './supabase'
import { addLog } from './logs'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
export const API_BASE_URL = API_URL

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession()
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session?.access_token || ''}`,
  }
}

export async function identifyMachine(images) {
  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const startTime = Date.now()
  addLog({
    level: 'info',
    event: 'identify.start',
    message: 'Identify request started.',
    meta: { requestId, imageCount: images?.length || 0, url: `${API_URL}/api/identify-machine` },
  })
  const headers = await authHeaders()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 15000)
  try {
    const res = await fetch(`${API_URL}/api/identify-machine`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ images }),
      signal: controller.signal,
    })
    addLog({
      level: res.ok ? 'info' : 'error',
      event: 'identify.response',
      message: res.ok ? 'Identify response received.' : 'Identify response error.',
      meta: { requestId, status: res.status, ok: res.ok, duration_ms: Date.now() - startTime },
    })
    if (!res.ok) {
      const errText = (await res.text()).trim()
      const detail = errText || `Server error (${res.status})`
      throw new Error(`Identify failed: ${detail}`)
    }
    try {
      return await res.json()
    } catch {
      throw new Error('Identify failed: Invalid JSON response from server.')
    }
  } catch (err) {
    const message = err?.message || 'Unknown error'
    addLog({
      level: 'error',
      event: 'identify.error',
      message,
      meta: { requestId, duration_ms: Date.now() - startTime },
    })
    if (err?.name === 'AbortError') {
      throw new Error('Identify failed: Request timed out. Please try again.')
    }
    if (err?.message?.startsWith('Identify failed:')) {
      throw err
    }
    if (err instanceof TypeError) {
      throw new Error('Identify failed: Backend unreachable. Check your connection and API URL.')
    }
    throw new Error('Identify failed: Unexpected error. Please try again.')
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function pingHealth() {
  const headers = await authHeaders()
  const startTime = Date.now()
  const res = await fetch(`${API_URL}/api/health`, { headers })
  const text = await res.text()
  addLog({
    level: res.ok ? 'info' : 'error',
    event: 'health.check',
    message: res.ok ? 'Health check succeeded.' : 'Health check failed.',
    meta: { status: res.status, duration_ms: Date.now() - startTime },
  })
  return { ok: res.ok, status: res.status, body: text }
}

export async function getRecommendations(currentSession, pastSessions, machines, sorenessData) {
  const headers = await authHeaders()
  const res = await fetch(`${API_URL}/api/recommendations`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      current_session: currentSession,
      past_sessions: pastSessions,
      machines,
      soreness_data: sorenessData || [],
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Recommendations failed: ${err}`)
  }
  return res.json()
}
