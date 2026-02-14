const DEFAULT_DAY_START_HOUR = 4
const DAY_MS = 24 * 60 * 60 * 1000

const toDate = (value) => {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const parseYmd = (value) => {
  if (typeof value !== 'string') return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const utc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0))
  if (
    utc.getUTCFullYear() !== year
    || utc.getUTCMonth() !== month - 1
    || utc.getUTCDate() !== day
  ) {
    return null
  }
  return { year, month, day }
}

const formatYmd = (parts) => `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`

const shiftYmd = (dayKey, deltaDays) => {
  const parsed = parseYmd(dayKey)
  if (!parsed) return null
  const utc = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + deltaDays, 12, 0, 0, 0))
  return formatYmd({ year: utc.getUTCFullYear(), month: utc.getUTCMonth() + 1, day: utc.getUTCDate() })
}

const getWeekdayForDayKey = (dayKey) => {
  const parsed = parseYmd(dayKey)
  if (!parsed) return null
  return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day, 12, 0, 0, 0)).getUTCDay()
}

const normalizeSetType = (value) => String(value || 'working').trim() || 'working'

const normalizeDayStartHour = (value) => {
  const candidate = Number(value)
  if (!Number.isFinite(candidate)) return DEFAULT_DAY_START_HOUR
  return Math.min(23, Math.max(0, Math.floor(candidate)))
}

const getEffectiveDayKey = (dateValue = new Date(), dayStartHour = DEFAULT_DAY_START_HOUR) => {
  const date = toDate(dateValue) || new Date()
  const effective = new Date(date)
  if (effective.getHours() < normalizeDayStartHour(dayStartHour)) {
    effective.setDate(effective.getDate() - 1)
  }
  return formatYmd({
    year: effective.getFullYear(),
    month: effective.getMonth() + 1,
    day: effective.getDate(),
  })
}

const getWindowForDayKey = (dayKey, dayStartHour = DEFAULT_DAY_START_HOUR) => {
  const parsed = parseYmd(dayKey)
  if (!parsed) return null
  const start = new Date(parsed.year, parsed.month - 1, parsed.day)
  start.setHours(normalizeDayStartHour(dayStartHour), 0, 0, 0)
  return { startMs: start.getTime(), endMs: start.getTime() + DAY_MS }
}

const buildMatchKey = ({ machineId, setType }) => `${machineId || ''}::${normalizeSetType(setType)}`

export function computeDayAdherence(planItems = [], loggedSets = [], { dayKey, dayStartHour = DEFAULT_DAY_START_HOUR, now = new Date() } = {}) {
  const targetDayKey = dayKey || getEffectiveDayKey(now, dayStartHour)
  const window = getWindowForDayKey(targetDayKey, dayStartHour)
  const setsInWindow = window
    ? loggedSets.filter((set) => {
      if (set?.training_date) return set.training_date === targetDayKey
      const logged = toDate(set?.logged_at)
      if (!logged) return false
      const loggedMs = logged.getTime()
      return loggedMs >= window.startMs && loggedMs < window.endMs
    })
    : []

  const matchedSetCounts = new Map()
  setsInWindow.forEach((set) => {
    const key = buildMatchKey({ machineId: set?.machine_id, setType: set?.set_type })
    matchedSetCounts.set(key, (matchedSetCounts.get(key) || 0) + 1)
  })

  const normalizedItems = [...planItems].map((item, index) => {
    const plannedSetsRaw = Number(item?.targetSets)
    const plannedSets = Number.isFinite(plannedSetsRaw) && plannedSetsRaw > 0 ? Math.floor(plannedSetsRaw) : 0
    return {
      id: item?.id || `item-${index}`,
      orderIndex: Number.isFinite(Number(item?.orderIndex)) ? Number(item.orderIndex) : Number.MAX_SAFE_INTEGER,
      machineId: item?.equipmentId || item?.machine_id || null,
      setType: normalizeSetType(item?.targetSetType || item?.target_set_type),
      plannedSets,
      raw: item,
    }
  })

  const grouped = new Map()
  normalizedItems.forEach((item) => {
    const key = buildMatchKey({ machineId: item.machineId, setType: item.setType })
    const existing = grouped.get(key) || []
    existing.push(item)
    grouped.set(key, existing)
  })

  const allocatedByItemId = new Map()
  grouped.forEach((itemsForKey, key) => {
    const available = matchedSetCounts.get(key) || 0
    let remaining = available
    const sorted = [...itemsForKey].sort((a, b) => {
      if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex
      return String(a.id).localeCompare(String(b.id))
    })

    sorted.forEach((item) => {
      if (item.plannedSets > 0) {
        const allocated = Math.min(item.plannedSets, remaining)
        allocatedByItemId.set(item.id, allocated)
        remaining -= allocated
      } else {
        allocatedByItemId.set(item.id, 0)
      }
    })

    if (remaining > 0) {
      for (const item of sorted) {
        if (remaining <= 0) break
        if (item.plannedSets > 0) continue
        allocatedByItemId.set(item.id, (allocatedByItemId.get(item.id) || 0) + 1)
        remaining -= 1
      }
    }
  })

  const items = normalizedItems.map((item) => {
    const completedSets = allocatedByItemId.get(item.id) || 0
    const touched = completedSets > 0
    const isComplete = item.plannedSets > 0 ? completedSets >= item.plannedSets : touched
    const isPartial = item.plannedSets > 0 && completedSets > 0 && completedSets < item.plannedSets

    return {
      ...item.raw,
      machineId: item.machineId,
      targetSetType: item.setType,
      plannedSets: item.plannedSets,
      completedSets,
      touched,
      isComplete,
      isPartial,
    }
  })

  const plannedSets = items.reduce((sum, item) => sum + (item.plannedSets > 0 ? item.plannedSets : 0), 0)
  const completedSets = items.reduce((sum, item) => sum + (item.plannedSets > 0 ? Math.min(item.completedSets, item.plannedSets) : 0), 0)
  const touchedItems = items.filter((item) => item.touched).length
  const completeItems = items.filter((item) => item.isComplete).length
  const partialItems = items.filter((item) => item.isPartial).length
  const totalItems = items.length

  return {
    dayKey: targetDayKey,
    dayStartHour: normalizeDayStartHour(dayStartHour),
    plannedSets,
    completedSets,
    touchedItems,
    completeItems,
    partialItems,
    totalItems,
    ratio: plannedSets > 0 ? completedSets / plannedSets : (totalItems > 0 ? touchedItems / totalItems : 0),
    items,
    matchedSetCount: setsInWindow.length,
  }
}

export function computeWeekAdherence({
  planDays = [],
  planItems = [],
  loggedSets = [],
  dayStartHour = DEFAULT_DAY_START_HOUR,
  anchorDate = new Date(),
} = {}) {
  const anchorDayKey = getEffectiveDayKey(anchorDate, dayStartHour)
  const anchorWeekday = getWeekdayForDayKey(anchorDayKey)
  const mondayOffset = anchorWeekday === null ? 0 : (anchorWeekday + 6) % 7
  const mondayKey = shiftYmd(anchorDayKey, -mondayOffset)

  const planByWeekday = new Map()
  planDays.forEach((day) => {
    if (!Number.isInteger(day?.weekday)) return
    planByWeekday.set(day.weekday, day)
  })

  const itemsByDayId = new Map()
  planItems.forEach((item) => {
    const key = item?.planDayId || item?.plan_day_id
    if (!key) return
    const existing = itemsByDayId.get(key) || []
    existing.push(item)
    itemsByDayId.set(key, existing)
  })

  const days = Array.from({ length: 7 }, (_, index) => {
    const dayKey = shiftYmd(mondayKey, index)
    const weekday = getWeekdayForDayKey(dayKey)
    const planDay = planByWeekday.get(weekday)
    const dayItems = planDay ? (itemsByDayId.get(planDay.id) || []) : []
    const adherence = computeDayAdherence(dayItems, loggedSets, { dayKey, dayStartHour, now: anchorDate })
    return {
      dayKey,
      weekday,
      planDayId: planDay?.id || null,
      label: planDay?.label || null,
      ...adherence,
    }
  })

  return summarizePlanProgress(days)
}

export function summarizePlanProgress(dayAdherenceEntries = []) {
  const safeEntries = dayAdherenceEntries.filter(Boolean)
  const plannedSets = safeEntries.reduce((sum, day) => sum + (day.plannedSets || 0), 0)
  const completedSets = safeEntries.reduce((sum, day) => sum + (day.completedSets || 0), 0)
  const plannedItems = safeEntries.reduce((sum, day) => sum + (day.totalItems || 0), 0)
  const touchedItems = safeEntries.reduce((sum, day) => sum + (day.touchedItems || 0), 0)
  const partialItems = safeEntries.reduce((sum, day) => sum + (day.partialItems || 0), 0)

  return {
    days: safeEntries,
    plannedSets,
    completedSets,
    plannedItems,
    touchedItems,
    partialItems,
    ratio: plannedSets > 0 ? completedSets / plannedSets : (plannedItems > 0 ? touchedItems / plannedItems : 0),
    completionMode: plannedSets > 0 ? 'set_targets' : 'exercise_touch',
  }
}
