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

export function computeWorkloadByMuscleGroup(sets = [], machines = []) {
  const machineById = new Map(machines.map((machine) => [machine.id, machine]))
  const totals = new Map()
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

    groups.forEach((group) => {
      totals.set(group, (totals.get(group) || 0) + contributionPerGroup)
    })

    totalWorkload += setVolume
    contributingSetCount += 1
  })

  const groups = Array.from(totals.entries())
    .map(([muscleGroup, workload]) => ({ muscleGroup, workload }))
    .sort((a, b) => b.workload - a.workload)

  return {
    groups,
    totalWorkload,
    contributingSetCount,
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
