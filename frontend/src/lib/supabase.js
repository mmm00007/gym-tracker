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

export async function bootstrapDefaultEquipmentCatalog() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.id) return

  const bootstrapKey = `library-seeded:v1:${user.id}`
  const alreadyBootstrapped = typeof window !== 'undefined' && window.localStorage.getItem(bootstrapKey) === 'done'
  if (alreadyBootstrapped) return

  const markDone = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(bootstrapKey, 'done')
    }
  }

  // Primary expected RPC (phase roadmap contract).
  const { error: seedError } = await supabase.rpc('seed_default_equipment_catalog')
  if (!seedError) {
    markDone()
    return
  }

  // Fallback for older DBs that may still expose the legacy machine-named RPC.
  if (seedError.code === '42883') {
    const { error: legacyError } = await supabase.rpc('seed_default_machine_catalog')
    if (legacyError && legacyError.code !== '42883') {
      throw legacyError
    }
    if (!legacyError) {
      markDone()
      return
    }
  }

  // If both RPCs are missing, do not block app usage.
  if (seedError.code === '42883') {
    markDone()
    return
  }

  throw seedError
}

// ─── Equipment CRUD (machines table at DB level) ───────────
export async function getEquipment() {
  const { data, error } = await supabase
    .from('machines').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function upsertEquipment(equipment) {
  const { data: { user } } = await supabase.auth.getUser()
  const payload = { ...equipment, user_id: user.id, updated_at: new Date().toISOString() }
  if (!payload.created_at) payload.created_at = new Date().toISOString()
  if (!payload.equipment_type) payload.equipment_type = 'machine'
  const { data, error } = await supabase
    .from('machines').upsert(payload, { onConflict: 'id' }).select().single()
  if (error) throw error
  return data
}

export async function deleteEquipment(id) {
  const { error } = await supabase.from('machines').delete().eq('id', id)
  if (error) throw error
}

// Backwards-compatible aliases while the UI is still machine-labeled.
export const getMachines = getEquipment
export const upsertMachine = upsertEquipment
export const deleteMachine = deleteEquipment

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
  const query = supabase.from('sets').select('*').order('logged_at')
  const { data, error } = sessionId
    ? await query.eq('session_id', sessionId)
    : await query
  if (error) throw error
  return data
}

export async function logSet(sessionId, machineId, reps, weight, durationSeconds, restSeconds, setType = 'working') {
  const { data: { user } } = await supabase.auth.getUser()
  const payload = {
    user_id: user.id,
    machine_id: machineId,
    reps,
    weight,
    set_type: setType || 'working',
    duration_seconds: durationSeconds || null,
    rest_seconds: restSeconds || null,
  }

  if (sessionId) payload.session_id = sessionId

  const { data, error } = await supabase
    .from('sets').insert(payload).select().single()
  if (error) throw error
  return data
}

export async function deleteSet(id) {
  const { error } = await supabase.from('sets').delete().eq('id', id)
  if (error) throw error
}

// ─── Soreness ──────────────────────────────────────────────
export async function getPendingSoreness() {
  // Get training buckets from 1-3 days ago without soreness reports.
  const { data: { user } } = await supabase.auth.getUser()
  const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString()
  const oneDayAgo = new Date(Date.now() - 1 * 86400000).toISOString()

  const { data: sets, error: setsError } = await supabase
    .from('sets')
    .select('training_bucket_id, training_date, logged_at, machine_id')
    .eq('user_id', user.id)
    .gte('logged_at', threeDaysAgo)
    .lte('logged_at', oneDayAgo)
    .order('logged_at', { ascending: true })

  if (setsError) throw setsError
  if (!sets?.length) return []

  const buckets = new Map()
  for (const row of sets) {
    const existing = buckets.get(row.training_bucket_id)
    if (!existing) {
      buckets.set(row.training_bucket_id, {
        id: row.training_bucket_id,
        training_bucket_id: row.training_bucket_id,
        training_date: row.training_date,
        started_at: row.logged_at,
        ended_at: row.logged_at,
        _sets: [row],
      })
      continue
    }

    if (new Date(row.logged_at) < new Date(existing.started_at)) existing.started_at = row.logged_at
    if (new Date(row.logged_at) > new Date(existing.ended_at)) existing.ended_at = row.logged_at
    existing._sets.push(row)
  }

  const bucketIds = [...buckets.keys()]
  const { data: existing, error: sorenessError } = await supabase
    .from('soreness_reports')
    .select('training_bucket_id')
    .in('training_bucket_id', bucketIds)

  if (sorenessError) throw sorenessError

  const reportedIds = new Set((existing || []).map((r) => r.training_bucket_id))
  return [...buckets.values()].filter((bucket) => !reportedIds.has(bucket.training_bucket_id))
}

export async function submitSoreness(trainingBucketId, reports) {
  const { data: { user } } = await supabase.auth.getUser()
  const rows = reports.map((r) => ({
    user_id: user.id,
    training_bucket_id: trainingBucketId,
    muscle_group: r.muscleGroup,
    level: r.level,
  }))
  const { error } = await supabase.from('soreness_reports').insert(rows)
  if (error) throw error
}

export async function createRecommendationScope(scope, metadata = null) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.id) throw new Error('Not authenticated')

  const payload = {
    user_id: user.id,
    grouping: scope?.grouping || 'training_day',
    date_start: scope?.date_start || null,
    date_end: scope?.date_end || null,
    included_set_types: Array.isArray(scope?.included_set_types) && scope.included_set_types.length
      ? scope.included_set_types
      : ['working'],
  }

  if (metadata && typeof metadata === 'object') {
    payload.metadata = metadata
  }

  const { data, error } = await supabase
    .from('recommendation_scopes')
    .insert(payload)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function getRecentSoreness() {
  const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString()
  const { data, error } = await supabase
    .from('soreness_reports').select('*')
    .gte('reported_at', twoWeeksAgo).order('reported_at', { ascending: false })
  if (error) throw error
  return data || []
}
