import { supabase } from './supabase'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession()
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session?.access_token || ''}`,
  }
}

export async function identifyMachine(images) {
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
