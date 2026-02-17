const toDate = (value) => {
  const date = value instanceof Date ? new Date(value) : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const parseLocalCalendarDate = (value) => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }

  return date
}

const formatLocalDateKey = (value) => {
  const date = toDate(value)
  if (!date) return null

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const startOfLocalDay = (value) => {
  const date = toDate(value)
  if (!date) return null
  date.setHours(0, 0, 0, 0)
  return date
}

const startOfLocalWeek = (value) => {
  const day = startOfLocalDay(value)
  if (!day) return null
  const diff = (day.getDay() + 6) % 7
  day.setDate(day.getDate() - diff)
  return day
}

const coerceDayStartHour = (value, fallback = 4) => {
  const hour = Number(value)
  if (!Number.isFinite(hour)) return fallback
  return Math.min(23, Math.max(0, Math.floor(hour)))
}

const shiftByEffectiveDayBoundary = (value, { dayStartHour = 4 } = {}) => {
  const date = toDate(value)
  if (!date) return null

  if (date.getHours() < coerceDayStartHour(dayStartHour)) {
    date.setDate(date.getDate() - 1)
  }

  return date
}

export const getSetLocalDayKey = (set, { dayStartHour = 4 } = {}) => {
  const trainingDate = parseLocalCalendarDate(set?.training_date)
  if (trainingDate) return formatLocalDateKey(trainingDate)

  const effective = shiftByEffectiveDayBoundary(set?.logged_at, { dayStartHour })
  if (!effective) return null

  return formatLocalDateKey(effective)
}

export function aggregateSetsByLocalDay(sets = [], { dayStartHour = 4 } = {}) {
  const byDay = new Map()

  sets.forEach((set) => {
    const dayKey = getSetLocalDayKey(set, { dayStartHour })
    if (!dayKey) return

    const reps = Number(set?.reps)
    const weight = Number(set?.weight)
    const safeReps = Number.isFinite(reps) && reps > 0 ? reps : 0
    const safeWeight = Number.isFinite(weight) && weight > 0 ? weight : 0

    const current = byDay.get(dayKey) || {
      dayKey,
      setCount: 0,
      totalReps: 0,
      totalVolume: 0,
    }

    current.setCount += 1
    current.totalReps += safeReps
    current.totalVolume += safeReps * safeWeight
    byDay.set(dayKey, current)
  })

  return Array.from(byDay.values()).sort((a, b) => a.dayKey.localeCompare(b.dayKey))
}

const MUSCLE_BASELINE_COEFFICIENT = {
  Chest: 1,
  Back: 1.1,
  Shoulders: 0.8,
  Biceps: 0.55,
  Triceps: 0.55,
  Legs: 1.35,
  Core: 0.6,
  Glutes: 1,
  Calves: 0.5,
  Forearms: 0.45,
  Hamstrings: 0.8,
  Quadriceps: 0.95,
}

const DEFAULT_BASELINE_COEFFICIENT = 1
const MIN_STABLE_SESSIONS_PER_GROUP = 3
const MIN_STABLE_SESSIONS_BY_SCOPE = {
  all: 3,
  month: 2,
  week: 1,
}

const isFiniteNonNegative = (value) => Number.isFinite(value) && value >= 0

const computeMedian = (values = []) => {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2
}

const toTrainingSessionKey = (set) => {
  if (set?.training_bucket_id) return `bucket:${set.training_bucket_id}`
  const explicitDate = parseLocalCalendarDate(set?.training_date)
  if (explicitDate) return `day:${formatLocalDateKey(explicitDate)}`
  const loggedDate = formatLocalDateKey(set?.logged_at)
  return loggedDate ? `day:${loggedDate}` : null
}

export function computeWindowedSets(sets = [], { scope = 'week', dayStartHour = 4, now = new Date() } = {}) {
  const effectiveToday = startOfLocalDay(shiftByEffectiveDayBoundary(now, { dayStartHour }))
  if (!effectiveToday) {
    return { scope, sets: [], fromDayKey: null, toDayKey: null }
  }

  const toDayKey = formatLocalDateKey(effectiveToday)
  const scopeStart = scope === 'month'
    ? new Date(effectiveToday.getFullYear(), effectiveToday.getMonth(), 1)
    : startOfLocalWeek(effectiveToday)
  const fromDayKey = formatLocalDateKey(scopeStart)

  const scopedSets = sets.filter((set) => {
    const dayKey = getSetLocalDayKey(set, { dayStartHour })
    if (!dayKey || !fromDayKey || !toDayKey) return false
    return dayKey >= fromDayKey && dayKey <= toDayKey
  })
  const trainingDayCount = new Set(scopedSets
    .map((set) => getSetLocalDayKey(set, { dayStartHour }))
    .filter(Boolean)).size

  return {
    scope: scope === 'month' ? 'month' : 'week',
    sets: scopedSets,
    fromDayKey,
    toDayKey,
    trainingDayCount,
  }
}

const resolveMuscleContributionProfile = (machine) => {
  const profileEntries = Array.isArray(machine?.muscle_profile) ? machine.muscle_profile : []
  const weightedEntries = profileEntries
    .map((entry) => {
      const group = typeof entry?.group === 'string' ? entry.group.trim() : ''
      if (!group) return null

      if (entry?.role === 'secondary') {
        const percent = Number(entry?.percent)
        const ratio = Number.isFinite(percent) && percent > 0 ? percent / 100 : 0.5
        return { group, weight: ratio }
      }

      return { group, weight: 1 }
    })
    .filter((entry) => entry && entry.weight > 0)

  if (weightedEntries.length) {
    return { entries: weightedEntries, confidence: 'high' }
  }

  const groups = (machine?.muscle_groups || []).filter(Boolean)
  if (!groups.length) return { entries: [], confidence: 'none' }

  const fallbackWeight = 1 / groups.length
  return {
    entries: groups.map((group) => ({ group, weight: fallbackWeight })),
    confidence: 'low',
  }
}

export function computeWorkloadByMuscleGroup(sets = [], machines = [], { scope = 'all' } = {}) {
  const machineById = new Map(machines.map((machine) => [machine.id, machine]))
  const totals = new Map()
  const groupSessionVolumes = new Map()
  const groupFallbackContributions = new Map()
  let totalWorkload = 0
  let contributingSetCount = 0

  sets.forEach((set) => {
    const reps = Number(set?.reps)
    const weight = Number(set?.weight)
    if (!Number.isFinite(reps) || !Number.isFinite(weight) || reps <= 0 || weight < 0) return

    const machine = machineById.get(set.machine_id)
    const profile = resolveMuscleContributionProfile(machine)
    if (!profile.entries.length) return

    const setVolume = reps * weight
    const weightTotal = profile.entries.reduce((sum, entry) => sum + entry.weight, 0)
    if (!weightTotal) return
    const sessionKey = toTrainingSessionKey(set)

    profile.entries.forEach(({ group, weight }) => {
      const contribution = setVolume * (weight / weightTotal)
      totals.set(group, (totals.get(group) || 0) + contribution)

      if (!sessionKey) return
      const sessions = groupSessionVolumes.get(group) || new Map()
      sessions.set(sessionKey, (sessions.get(sessionKey) || 0) + contribution)
      groupSessionVolumes.set(group, sessions)

      if (profile.confidence === 'low') {
        groupFallbackContributions.set(group, (groupFallbackContributions.get(group) || 0) + contribution)
      }
    })

    totalWorkload += setVolume
    contributingSetCount += 1
  })

  const allGroupSessionVolumes = Array.from(groupSessionVolumes.values())
    .flatMap((sessions) => Array.from(sessions.values()))
    .filter(isFiniteNonNegative)
  const globalGroupSessionMedian = computeMedian(allGroupSessionVolumes)

  const minStableSessions = MIN_STABLE_SESSIONS_BY_SCOPE[scope] || MIN_STABLE_SESSIONS_PER_GROUP

  const groups = Array.from(totals.entries())
    .map(([muscleGroup, rawVolume]) => {
      const perSession = Array.from(groupSessionVolumes.get(muscleGroup)?.values() || [])
        .filter(isFiniteNonNegative)
      const observedSessions = perSession.length
      const observedMedian = computeMedian(perSession)
      const priorBaseline = (globalGroupSessionMedian || 1)
        * (MUSCLE_BASELINE_COEFFICIENT[muscleGroup] || DEFAULT_BASELINE_COEFFICIENT)
      const sparseWeight = Math.min(1, observedSessions / minStableSessions)
      const blendedBaseline = (observedMedian * sparseWeight) + (priorBaseline * (1 - sparseWeight))
      const normalizedRawScore = rawVolume / Math.max(blendedBaseline, 1)
      const normalizedScore = observedSessions >= minStableSessions
        ? normalizedRawScore
        : 1 + ((normalizedRawScore - 1) * sparseWeight)

      return {
        muscleGroup,
        workload: rawVolume,
        rawVolume,
        normalizedScore,
        baselineVolume: blendedBaseline,
        observedSessions,
        sparseData: observedSessions < minStableSessions,
        confidence: groupFallbackContributions.get(muscleGroup) > 0 ? 'mixed' : 'high',
      }
    })
    .sort((a, b) => b.normalizedScore - a.normalizedScore)

  return {
    groups,
    totalWorkload,
    contributingSetCount,
    normalization: {
      method: 'blended_group_session_median',
      description: 'Weighted set volume uses machine muscle profile (primary = 100%, secondary = configured %), then normalizes by a blended group baseline. Scores are shrunk toward 1.0 until each group reaches a scope-specific minimum session count.',
      minStableSessionsPerGroup: minStableSessions,
      globalGroupSessionMedian,
      muscleBaselineCoefficient: MUSCLE_BASELINE_COEFFICIENT,
      hasFallbackInference: groupFallbackContributions.size > 0,
    },
  }
}

export function computeWeeklyConsistency(sets = [], { rollingWeeks = 6, dayStartHour = 4 } = {}) {
  const safeWeeks = Math.max(1, Math.floor(rollingWeeks))
  const today = startOfLocalDay(shiftByEffectiveDayBoundary(new Date(), { dayStartHour }))
  const startWeek = startOfLocalWeek(today)
  const weekStarts = Array.from({ length: safeWeeks }, (_, index) => {
    const weekStart = new Date(startWeek)
    weekStart.setDate(weekStart.getDate() - (safeWeeks - 1 - index) * 7)
    return weekStart
  })

  const trainingDays = new Set()
  sets.forEach((set) => {
    const dayKey = getSetLocalDayKey(set, { dayStartHour })
    if (!dayKey) return
    trainingDays.add(dayKey)
  })

  const weeks = weekStarts.map((weekStart) => {
    const completedDays = Array.from({ length: 7 }, (_, offset) => {
      const day = new Date(weekStart)
      day.setDate(day.getDate() + offset)
      return formatLocalDateKey(day)
    }).filter((dayKey) => trainingDays.has(dayKey)).length

    return {
      weekStart: formatLocalDateKey(weekStart),
      completedDays,
      possibleDays: 7,
      ratio: completedDays / 7,
    }
  })

  const completedDays = weeks.reduce((sum, week) => sum + week.completedDays, 0)
  const possibleDays = weeks.length * 7

  return {
    weeks,
    completedDays,
    possibleDays,
    ratio: possibleDays ? completedDays / possibleDays : 0,
  }
}

export function computeCurrentWeekConsistency(sets = [], { dayStartHour = 4 } = {}) {
  const today = startOfLocalDay(shiftByEffectiveDayBoundary(new Date(), { dayStartHour }))
  const weekStart = startOfLocalWeek(today)
  const trainingDays = new Set()

  sets.forEach((set) => {
    const dayKey = getSetLocalDayKey(set, { dayStartHour })
    if (!dayKey) return
    trainingDays.add(dayKey)
  })

  const completedDays = Array.from({ length: 7 }, (_, offset) => {
    const day = new Date(weekStart)
    day.setDate(day.getDate() + offset)
    return formatLocalDateKey(day)
  }).filter((dayKey) => trainingDays.has(dayKey)).length

  return {
    weekStart: formatLocalDateKey(weekStart),
    completedDays,
    possibleDays: 7,
    ratio: completedDays / 7,
  }
}

export function computeWorkloadBalanceIndex(workloadByGroup = []) {
  const positive = workloadByGroup
    .map((entry) => Number(entry?.workload) || 0)
    .filter((value) => value > 0)

  const activeGroups = positive.length
  if (!activeGroups) {
    return { index: 0, activeGroups, totalWorkload: 0 }
  }

  const totalWorkload = positive.reduce((sum, value) => sum + value, 0)
  if (!totalWorkload || activeGroups === 1) {
    return { index: 0, activeGroups, totalWorkload }
  }

  const entropy = positive.reduce((sum, value) => {
    const p = value / totalWorkload
    return p > 0 ? sum - p * Math.log(p) : sum
  }, 0)
  const maxEntropy = Math.log(activeGroups)

  return {
    index: maxEntropy ? entropy / maxEntropy : 0,
    activeGroups,
    totalWorkload,
  }
}

export function buildSampleWarning({ contributingSetCount = 0, activeGroups = 0, trainingDays = 0, rollingWeeks = 6, scope = 'all' }) {
  if (contributingSetCount === 0) return 'No set volume data yet.'
  if (activeGroups < 2) return 'Need at least 2 active muscle groups for meaningful balance.'
  const minDaysByScope = {
    week: 1,
    month: 2,
    all: Math.min(rollingWeeks, 3),
  }
  const minDays = minDaysByScope[scope] || minDaysByScope.all
  if (trainingDays < minDays) return `Consistency may be noisy with fewer than ${minDays} training days.`
  return null
}
