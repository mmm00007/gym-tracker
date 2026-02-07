import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY env vars')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ─── Auth helpers ──────────────────────────────────────────
// Users only type a username. We convert it to a fake email
// under the hood since Supabase auth requires email format.
const toEmail = (username) => `${username.toLowerCase().trim()}@irontracker.local`

export async function signUp(username, password) {
  const email = toEmail(username)
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username: username.trim() } },
  })
  if (error) throw error
  return data
}

export async function signIn(username, password) {
  const email = toEmail(username)
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

// ─── Machine CRUD ──────────────────────────────────────────
export async function getMachines() {
  const { data, error } = await supabase
    .from('machines').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function upsertMachine(machine) {
  const { data: { user } } = await supabase.auth.getUser()
  const payload = { ...machine, user_id: user.id, updated_at: new Date().toISOString() }
  if (!payload.created_at) payload.created_at = new Date().toISOString()
  const { data, error } = await supabase
    .from('machines').upsert(payload, { onConflict: 'id' }).select().single()
  if (error) throw error
  return data
}

export async function deleteMachine(id) {
  const { error } = await supabase.from('machines').delete().eq('id', id)
  if (error) throw error
}

// ─── Session CRUD ──────────────────────────────────────────
export async function getSessions() {
  const { data, error } = await supabase
    .from('sessions').select('*').order('started_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createSession() {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('sessions').insert({ user_id: user.id }).select().single()
  if (error) throw error
  return data
}

export async function endSession(id, recommendations) {
  const { data, error } = await supabase
    .from('sessions')
    .update({ ended_at: new Date().toISOString(), recommendations })
    .eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function getActiveSession() {
  const { data, error } = await supabase
    .from('sessions').select('*')
    .is('ended_at', null).order('started_at', { ascending: false }).limit(1)
  if (error) throw error
  return data?.[0] || null
}

// ─── Set CRUD ──────────────────────────────────────────────
export async function getSetsForSession(sessionId) {
  const { data, error } = await supabase
    .from('sets').select('*').eq('session_id', sessionId).order('logged_at')
  if (error) throw error
  return data
}

export async function logSet(sessionId, machineId, reps, weight, durationSeconds, restSeconds) {
  const { data, error } = await supabase
    .from('sets').insert({
      session_id: sessionId,
      machine_id: machineId,
      reps, weight,
      duration_seconds: durationSeconds || null,
      rest_seconds: restSeconds || null,
    }).select().single()
  if (error) throw error
  return data
}

export async function deleteSet(id) {
  const { error } = await supabase.from('sets').delete().eq('id', id)
  if (error) throw error
}

// ─── Soreness ──────────────────────────────────────────────
export async function getPendingSoreness() {
  // Get sessions from 1-3 days ago that don't have soreness reports
  const { data: { user } } = await supabase.auth.getUser()
  const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString()
  const oneDayAgo = new Date(Date.now() - 1 * 86400000).toISOString()

  const { data: sessions } = await supabase
    .from('sessions').select('id, started_at, ended_at')
    .eq('user_id', user.id)
    .not('ended_at', 'is', null)
    .gte('ended_at', threeDaysAgo)
    .lte('ended_at', oneDayAgo)

  if (!sessions?.length) return []

  // Check which have soreness reports
  const sessionIds = sessions.map(s => s.id)
  const { data: existing } = await supabase
    .from('soreness_reports')
    .select('session_id')
    .in('session_id', sessionIds)

  const reportedIds = new Set((existing || []).map(r => r.session_id))
  return sessions.filter(s => !reportedIds.has(s.id))
}

export async function submitSoreness(sessionId, reports) {
  const { data: { user } } = await supabase.auth.getUser()
  const rows = reports.map(r => ({
    user_id: user.id,
    session_id: sessionId,
    muscle_group: r.muscleGroup,
    level: r.level,
  }))
  const { error } = await supabase.from('soreness_reports').insert(rows)
  if (error) throw error
}

export async function getRecentSoreness() {
  const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString()
  const { data, error } = await supabase
    .from('soreness_reports').select('*')
    .gte('reported_at', twoWeeksAgo).order('reported_at', { ascending: false })
  if (error) throw error
  return data || []
}
