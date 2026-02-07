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
  const res = await fetch(`${API_URL}/api/identify-machine`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ images }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Identify failed: ${err}`)
  }
  return res.json()
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
