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

export function computeWorkloadByMuscleGroup(sets = [], machines = []) {
  const machineById = new Map(machines.map((machine) => [machine.id, machine]))
  const totals = new Map()
  const groupSessionVolumes = new Map()
  let totalWorkload = 0
  let contributingSetCount = 0

  sets.forEach((set) => {
    const reps = Number(set?.reps)
    const weight = Number(set?.weight)
    if (!Number.isFinite(reps) || !Number.isFinite(weight) || reps <= 0 || weight < 0) return

    const machine = machineById.get(set.machine_id)
    const groups = (machine?.muscle_groups || []).filter(Boolean)
    if (!groups.length) return

    const setVolume = reps * weight
    const contributionPerGroup = setVolume / groups.length
    const sessionKey = toTrainingSessionKey(set)

    groups.forEach((group) => {
      totals.set(group, (totals.get(group) || 0) + contributionPerGroup)

      if (!sessionKey) return
      const sessions = groupSessionVolumes.get(group) || new Map()
      sessions.set(sessionKey, (sessions.get(sessionKey) || 0) + contributionPerGroup)
      groupSessionVolumes.set(group, sessions)
    })

    totalWorkload += setVolume
    contributingSetCount += 1
  })

  const allGroupSessionVolumes = Array.from(groupSessionVolumes.values())
    .flatMap((sessions) => Array.from(sessions.values()))
    .filter(isFiniteNonNegative)
  const globalGroupSessionMedian = computeMedian(allGroupSessionVolumes)

  const groups = Array.from(totals.entries())
    .map(([muscleGroup, rawVolume]) => {
      const perSession = Array.from(groupSessionVolumes.get(muscleGroup)?.values() || [])
        .filter(isFiniteNonNegative)
      const observedSessions = perSession.length
      const observedMedian = computeMedian(perSession)
      const priorBaseline = (globalGroupSessionMedian || 1)
        * (MUSCLE_BASELINE_COEFFICIENT[muscleGroup] || DEFAULT_BASELINE_COEFFICIENT)
      const sparseWeight = Math.min(1, observedSessions / MIN_STABLE_SESSIONS_PER_GROUP)
      const blendedBaseline = (observedMedian * sparseWeight) + (priorBaseline * (1 - sparseWeight))
      const normalizedRawScore = rawVolume / Math.max(blendedBaseline, 1)
      const normalizedScore = observedSessions >= MIN_STABLE_SESSIONS_PER_GROUP
        ? normalizedRawScore
        : 1 + ((normalizedRawScore - 1) * sparseWeight)

      return {
        muscleGroup,
        workload: rawVolume,
        rawVolume,
        normalizedScore,
        baselineVolume: blendedBaseline,
        observedSessions,
        sparseData: observedSessions < MIN_STABLE_SESSIONS_PER_GROUP,
      }
    })
    .sort((a, b) => b.normalizedScore - a.normalizedScore)

  return {
    groups,
    totalWorkload,
    contributingSetCount,
    normalization: {
      method: 'blended_group_session_median',
      description: 'Normalized score = raw volume ÷ blended baseline, where baseline combines each group\'s median per-session volume with a coefficient-weighted global group-session median. Scores are shrunk toward 1.0 until at least 3 sessions exist for that group.',
      minStableSessionsPerGroup: MIN_STABLE_SESSIONS_PER_GROUP,
      globalGroupSessionMedian,
      muscleBaselineCoefficient: MUSCLE_BASELINE_COEFFICIENT,
    },
  }
}

export function computeWeeklyConsistency(sets = [], { rollingWeeks = 6 } = {}) {
  const safeWeeks = Math.max(1, Math.floor(rollingWeeks))
  const today = startOfLocalDay(new Date())
  const startWeek = startOfLocalWeek(today)
  const weekStarts = Array.from({ length: safeWeeks }, (_, index) => {
    const weekStart = new Date(startWeek)
    weekStart.setDate(weekStart.getDate() - (safeWeeks - 1 - index) * 7)
    return weekStart
  })

  const trainingDays = new Set()
  sets.forEach((set) => {
    const day = set?.training_date
      ? parseLocalCalendarDate(set.training_date)
      : startOfLocalDay(set?.logged_at)
    if (!day) return
    trainingDays.add(formatLocalDateKey(day))
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

export function computeCurrentWeekConsistency(sets = []) {
  const today = startOfLocalDay(new Date())
  const weekStart = startOfLocalWeek(today)
  const trainingDays = new Set()

  sets.forEach((set) => {
    const day = set?.training_date
      ? parseLocalCalendarDate(set.training_date)
      : startOfLocalDay(set?.logged_at)
    if (!day) return
    trainingDays.add(formatLocalDateKey(day))
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

export function buildSampleWarning({ contributingSetCount = 0, activeGroups = 0, trainingDays = 0, rollingWeeks = 6 }) {
  if (contributingSetCount === 0) return 'No set volume data yet.'
  if (activeGroups < 2) return 'Need at least 2 active muscle groups for meaningful balance.'
  const minDays = Math.min(rollingWeeks, 3)
  if (trainingDays < minDays) return `Consistency may be noisy with fewer than ${minDays} training days.`
  return null
}
