import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY env vars')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const DB_ERROR_CODE_MESSAGES = {
  '23503': 'This item is linked to another record and cannot be modified this way.',
  '23505': 'This already exists. Try editing the existing entry instead.',
  '23514': 'One or more values are outside allowed limits.',
  '22P02': 'Some values are in an invalid format.',
  '42501': 'You do not have permission to perform this action.',
}

function mapDbError(error, contextMessage = 'Database request failed') {
  if (!error) return null

  const normalized = new Error(error.message || contextMessage)
  normalized.name = 'SupabaseError'
  normalized.code = error.code || null
  normalized.details = error.details || null
  normalized.hint = error.hint || null
  normalized.status = error.status || null
  normalized.contextMessage = contextMessage
  normalized.userMessage = DB_ERROR_CODE_MESSAGES[error.code] || contextMessage

  if (error.code === '42501') {
    normalized.userMessage = 'You may have lost access (RLS policy restriction). Refresh and sign in again.'
  }

  if (error.code === '23505' && /plan_days_plan_id_weekday_key/.test(error.message || '')) {
    normalized.userMessage = 'A day template already exists for that weekday in this plan.'
  }

  if (error.code === '23505' && /plan_items_plan_day_id_order_index_key/.test(error.message || '')) {
    normalized.userMessage = 'Another exercise already uses that order. Choose a different order index.'
  }

  if (error.code === '23503' && /plan_items_machine_id_fkey/.test(error.message || '')) {
    normalized.userMessage = 'Selected equipment was not found. Try selecting another exercise/equipment.'
  }

  return normalized
}

function throwMappedDbError(error, contextMessage) {
  if (error) throw mapDbError(error, contextMessage)
}

const normalizeEquipment = (row = null) => {
  if (!row) return null
  const muscleGroups = Array.isArray(row.muscle_groups) ? row.muscle_groups : []
  const thumbnails = Array.isArray(row.thumbnails)
    ? row.thumbnails
      .map((thumb) => {
        if (typeof thumb === 'string') {
          return {
            src: thumb,
            focalX: 50,
            focalY: 35,
          }
        }
        if (!thumb || typeof thumb !== 'object' || typeof thumb.src !== 'string') return null

        return {
          src: thumb.src,
          focalX: Number.isFinite(Number(thumb.focalX)) ? Number(thumb.focalX) : 50,
          focalY: Number.isFinite(Number(thumb.focalY)) ? Number(thumb.focalY) : 35,
        }
      })
      .filter(Boolean)
    : []
  const equipmentType = row.equipment_type || 'machine'
  const movement = row.movement || ''
  return {
    ...row,
    id: row.id,
    name: row.name || '',
    exercise: movement,
    movement,
    equipmentType,
    equipment_type: equipmentType,
    muscleGroups,
    muscle_groups: muscleGroups,
    notes: row.notes || '',
    imageUrl: row.image_url || '',
    image_url: row.image_url || '',
    thumbnails,
    createdAt: row.created_at || null,
    created_at: row.created_at || null,
    updatedAt: row.updated_at || null,
    updated_at: row.updated_at || null,
  }
}

const EQUIPMENT_DB_COLUMNS = [
  'id',
  'user_id',
  'name',
  'movement',
  'equipment_type',
  'muscle_groups',
  'notes',
  'image_url',
  'default_weight',
  'default_reps',
  'thumbnails',
  'instruction_image',
  'exercise_type',
  'source',
  'created_at',
  'updated_at',
]

function toEquipmentDbPayload(equipment = {}, userId) {
  const source = { ...equipment }
  const payload = {}

  if (Array.isArray(source.thumbnails)) {
    source.thumbnails = source.thumbnails
      .map((thumb) => {
        if (typeof thumb === 'string') {
          return { src: thumb, focalX: 50, focalY: 35 }
        }
        if (!thumb || typeof thumb !== 'object' || typeof thumb.src !== 'string') return null
        return {
          src: thumb.src,
          focalX: Number.isFinite(Number(thumb.focalX)) ? Number(thumb.focalX) : 50,
          focalY: Number.isFinite(Number(thumb.focalY)) ? Number(thumb.focalY) : 35,
        }
      })
      .filter(Boolean)
  }

  // Accept aliases from normalized objects/forms and map to DB columns.
  if (source.equipmentType !== undefined && source.equipment_type === undefined) {
    source.equipment_type = source.equipmentType
  }
  if (source.muscleGroups !== undefined && source.muscle_groups === undefined) {
    source.muscle_groups = source.muscleGroups
  }
  if (source.imageUrl !== undefined && source.image_url === undefined) {
    source.image_url = source.imageUrl
  }

  EQUIPMENT_DB_COLUMNS.forEach((key) => {
    if (source[key] !== undefined) payload[key] = source[key]
  })

  payload.user_id = userId
  payload.updated_at = new Date().toISOString()
  if (!payload.created_at) payload.created_at = new Date().toISOString()
  if (!payload.equipment_type) payload.equipment_type = 'machine'

  return payload
}

const normalizePlan = (row = {}) => ({
  id: row.id,
  name: row.name || '',
  goal: row.goal || '',
  isActive: Boolean(row.is_active),
  createdAt: row.created_at || null,
  updatedAt: row.updated_at || null,
})

const normalizePlanDay = (row = {}) => ({
  id: row.id,
  planId: row.plan_id,
  weekday: Number.isInteger(row.weekday) ? row.weekday : null,
  label: row.label || '',
  createdAt: row.created_at || null,
})

const normalizePlanItem = (row = {}) => ({
  id: row.id,
  planDayId: row.plan_day_id,
  equipmentId: row.machine_id || null,
  exercise: row.equipment?.movement || '',
  equipment: normalizeEquipment(row.equipment),
  targetSetType: row.target_set_type || 'working',
  targetSets: row.target_sets ?? null,
  targetRepRange: row.target_rep_range ?? null,
  targetWeightRange: row.target_weight_range ?? null,
  notes: row.notes || '',
  orderIndex: Number.isInteger(row.order_index) ? row.order_index : 0,
})

function getEffectiveWeekday(dateValue = new Date(), dayStartHour = 4) {
  const date = dateValue instanceof Date ? new Date(dateValue) : new Date(dateValue)
  const boundaryHour = Number.isFinite(Number(dayStartHour)) ? Number(dayStartHour) : 4
  if (Number.isNaN(date.getTime())) return new Date().getDay()

  const effective = new Date(date)
  if (effective.getHours() < boundaryHour) {
    effective.setDate(effective.getDate() - 1)
  }

  return effective.getDay()
}

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
  throwMappedDbError(error, 'Unable to load equipment catalog')
  return (data || []).map(normalizeEquipment)
}

export async function upsertEquipment(equipment) {
  const { data: { user } } = await supabase.auth.getUser()
  const payload = toEquipmentDbPayload(equipment, user.id)
  const { data, error } = await supabase
    .from('machines').upsert(payload, { onConflict: 'id' }).select().single()
  throwMappedDbError(error, 'Unable to save equipment')
  return normalizeEquipment(data)
}

export async function deleteEquipment(id) {
  const { error } = await supabase.from('machines').delete().eq('id', id)
  throwMappedDbError(error, 'Unable to delete equipment')
}

// ─── Plans CRUD ────────────────────────────────────────────
export async function getPlans() {
  const { data, error } = await supabase
    .from('plans')
    .select('*')
    .order('updated_at', { ascending: false })
  throwMappedDbError(error, 'Unable to load plans')
  return (data || []).map(normalizePlan)
}

export async function createPlan(plan = {}) {
  const { data: { user } } = await supabase.auth.getUser()
  const payload = {
    user_id: user?.id,
    name: String(plan?.name || '').trim(),
    goal: plan?.goal ? String(plan.goal).trim() : null,
    is_active: plan?.isActive ?? true,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('plans')
    .insert(payload)
    .select('*')
    .single()
  throwMappedDbError(error, 'Unable to create plan')
  return normalizePlan(data)
}

export async function updatePlan(id, plan = {}) {
  const payload = {
    ...(plan?.name !== undefined ? { name: String(plan.name || '').trim() } : {}),
    ...(plan?.goal !== undefined ? { goal: plan.goal ? String(plan.goal).trim() : null } : {}),
    ...(plan?.isActive !== undefined ? { is_active: Boolean(plan.isActive) } : {}),
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('plans')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single()
  throwMappedDbError(error, 'Unable to update plan')
  return normalizePlan(data)
}

export async function deletePlan(id) {
  const { error } = await supabase.from('plans').delete().eq('id', id)
  throwMappedDbError(error, 'Unable to delete plan')
}

export async function getPlanDays(planId) {
  const { data, error } = await supabase
    .from('plan_days')
    .select('*')
    .eq('plan_id', planId)
    .order('weekday', { ascending: true })
  throwMappedDbError(error, 'Unable to load plan days')
  return (data || []).map(normalizePlanDay)
}

export async function upsertPlanDay(planDay = {}) {
  const payload = {
    id: planDay?.id,
    plan_id: planDay?.planId,
    weekday: planDay?.weekday,
    label: planDay?.label ? String(planDay.label).trim() : null,
  }

  const { data, error } = await supabase
    .from('plan_days')
    .upsert(payload, { onConflict: 'plan_id,weekday' })
    .select('*')
    .single()
  throwMappedDbError(error, 'Unable to save plan day')
  return normalizePlanDay(data)
}

export async function deletePlanDay(id) {
  const { error } = await supabase.from('plan_days').delete().eq('id', id)
  throwMappedDbError(error, 'Unable to delete plan day')
}

export async function getPlanItems(planDayId) {
  const { data, error } = await supabase
    .from('plan_items')
    .select('*, equipment:machines(*)')
    .eq('plan_day_id', planDayId)
    .order('order_index', { ascending: true })
  throwMappedDbError(error, 'Unable to load plan exercises')
  return (data || []).map(normalizePlanItem)
}

export async function upsertPlanItem(planItem = {}) {
  const payload = {
    id: planItem?.id,
    plan_day_id: planItem?.planDayId,
    machine_id: planItem?.equipmentId ?? null,
    target_set_type: planItem?.targetSetType || 'working',
    target_sets: planItem?.targetSets ?? null,
    target_rep_range: planItem?.targetRepRange ?? null,
    target_weight_range: planItem?.targetWeightRange ?? null,
    notes: planItem?.notes ? String(planItem.notes).trim() : null,
    order_index: Number.isFinite(Number(planItem?.orderIndex)) ? Number(planItem.orderIndex) : 0,
  }

  const { data, error } = await supabase
    .from('plan_items')
    .upsert(payload, { onConflict: 'plan_day_id,order_index' })
    .select('*, equipment:machines(*)')
    .single()
  throwMappedDbError(error, 'Unable to save plan exercise')
  return normalizePlanItem(data)
}

export async function deletePlanItem(id) {
  const { error } = await supabase.from('plan_items').delete().eq('id', id)
  throwMappedDbError(error, 'Unable to delete plan exercise')
}

export async function getTodayPlanSuggestions({ date = new Date(), dayStartHour = 4 } = {}) {
  const weekday = getEffectiveWeekday(date, dayStartHour)
  const { data, error } = await supabase
    .from('plans')
    .select('*, plan_days!inner(*, plan_items(*, equipment:machines(*)))')
    .eq('is_active', true)
    .eq('plan_days.weekday', weekday)
    .order('updated_at', { ascending: false })

  throwMappedDbError(error, 'Unable to load today\'s plan suggestions')

  return (data || []).map((plan) => {
    const day = Array.isArray(plan.plan_days) ? plan.plan_days[0] : null
    const items = Array.isArray(day?.plan_items)
      ? [...day.plan_items].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)).map(normalizePlanItem)
      : []

    return {
      ...normalizePlan(plan),
      effectiveWeekday: weekday,
      day: day ? normalizePlanDay(day) : null,
      items,
    }
  })
}

export async function getEquipmentFavorites(window = '30d') {
  const rankColumn = window === '90d' ? 'rank_90d' : window === 'all' ? 'rank_all' : 'rank_30d'
  const countColumn = window === '90d' ? 'sets_90d' : window === 'all' ? 'sets_all' : 'sets_30d'

  const { data, error } = await supabase
    .from('equipment_set_counts')
    .select(`machine_id, sets_30d, sets_90d, sets_all, ${rankColumn}, equipment:machines(*)`)
    .order(rankColumn, { ascending: true })

  throwMappedDbError(error, 'Unable to load equipment favorites')

  return (data || []).map((row) => ({
    equipmentId: row.machine_id,
    setCount: row[countColumn] ?? 0,
    rank: row[rankColumn] ?? null,
    equipment: normalizeEquipment(row.equipment),
    exercise: row.equipment?.movement || '',
    window,
  }))
}

// Backwards-compatible aliases while the UI is still machine-labeled.
export const getMachines = getEquipment
export const upsertMachine = upsertEquipment
export const deleteMachine = deleteEquipment

// ─── Session CRUD (legacy compatibility only) ─────────────
// Deprecated: Phase 1 is set-centric. Session rows remain for historical
// compatibility and optional linkage only.
/** @deprecated Legacy helper retained for historical compatibility. */
export async function getSessions() {
  const { data, error } = await supabase
    .from('sessions').select('*').order('started_at', { ascending: false })
  if (error) throw error
  return data
}

/** @deprecated Legacy helper retained for historical compatibility. */
export async function createSession() {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('sessions').insert({ user_id: user.id }).select().single()
  if (error) throw error
  return data
}

/** @deprecated Legacy helper retained for historical compatibility. */
export async function endSession(id, recommendations) {
  const { data, error } = await supabase
    .from('sessions')
    .update({ ended_at: new Date().toISOString(), recommendations })
    .eq('id', id).select().single()
  if (error) throw error
  return data
}

/** @deprecated Legacy helper retained for historical compatibility. */
export async function getActiveSession() {
  const { data, error } = await supabase
    .from('sessions').select('*')
    .is('ended_at', null).order('started_at', { ascending: false }).limit(1)
  if (error) throw error
  return data?.[0] || null
}

// ─── Set CRUD ──────────────────────────────────────────────
export async function getSets(sessionId) {
  const query = supabase.from('sets').select('*').order('logged_at')
  const { data, error } = sessionId
    ? await query.eq('session_id', sessionId)
    : await query
  if (error) throw error
  return data
}

// Backwards-compatible alias while callers migrate.
/** @deprecated Use getSets(sessionId?) instead. */
export const getSetsForSession = getSets

export async function logSet(sessionId, machineId, reps, weight, durationSeconds, restSeconds, setType = 'working') {
  const { data: { user } } = await supabase.auth.getUser()
  const payload = {
    user_id: user.id,
    machine_id: machineId,
    reps,
    weight,
    set_type: setType || 'working',
    duration_seconds: durationSeconds ?? null,
    rest_seconds: restSeconds ?? null,
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

  const normalizedGoals = Array.isArray(scope?.goals)
    ? [...new Set(scope.goals.map((goal) => String(goal || '').trim()).filter(Boolean))]
    : []

  // Keep schema stable: persist goals and scope notes in recommendation_scopes.metadata.
  // Format: { goals: string[], recommendations: string | null, ...otherMetadata }
  const mergedMetadata = {
    goals: normalizedGoals,
    recommendations: typeof scope?.recommendations === 'string' ? scope.recommendations : null,
    ...(metadata && typeof metadata === 'object' ? metadata : {}),
  }

  const payload = {
    user_id: user.id,
    grouping: scope?.grouping || 'training_day',
    date_start: scope?.date_start || null,
    date_end: scope?.date_end || null,
    included_set_types: Array.isArray(scope?.included_set_types) && scope.included_set_types.length
      ? scope.included_set_types
      : ['working'],
    metadata: mergedMetadata,
  }

  const { data, error } = await supabase
    .from('recommendation_scopes')
    .insert(payload)
    .select()
    .single()

  if (error) throw error
  return data
}



export async function getAnalysisReports(reportType = null, filters = {}) {
  let query = supabase
    .from('analysis_reports')
    .select('*')
    .order('created_at', { ascending: false })

  if (reportType) {
    query = query.eq('report_type', reportType)
  }

  if (filters?.status) {
    query = query.eq('status', filters.status)
  }

  if (filters?.dateStart) {
    query = query.gte('created_at', `${filters.dateStart}T00:00:00.000Z`)
  }

  if (filters?.dateEnd) {
    query = query.lte('created_at', `${filters.dateEnd}T23:59:59.999Z`)
  }

  if (filters?.search) {
    const sanitized = String(filters.search).replace(/[%]/g, '').trim()
    if (sanitized) {
      query = query.or(`title.ilike.%${sanitized}%,summary.ilike.%${sanitized}%`)
    }
  }

  const limit = Math.max(1, Math.min(200, Number.parseInt(filters?.limit, 10) || 50))
  const { data, error } = await query.limit(limit)
  if (error) throw error
  return data || []
}

export async function getAnalysisReport(reportId) {
  const { data, error } = await supabase
    .from('analysis_reports')
    .select('*')
    .eq('id', reportId)
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
