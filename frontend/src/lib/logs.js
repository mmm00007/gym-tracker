const MAX_LOGS = 200
const STORAGE_KEY = 'gym-tracker.logs'
const GROUP_WINDOW_MS = 5000

const loadLogs = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    const parsed = stored ? JSON.parse(stored) : []
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry) => ({
        id: entry.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        timestamp: entry.timestamp || new Date().toISOString(),
        level: entry.level || 'info',
        event: entry.event || 'app.log',
        message: entry.message || '',
        meta: entry.meta || {},
        count: entry.count || 1,
      }))
  } catch (error) {
    console.warn('Failed to load logs from storage.', error)
    return []
  }
}

const persistLogs = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logs.slice(-MAX_LOGS)))
  } catch (error) {
    console.warn('Failed to persist logs.', error)
  }
}

const logs = loadLogs()
if (logs.length > MAX_LOGS) {
  logs.splice(0, logs.length - MAX_LOGS)
}
const listeners = new Set()

const notify = () => {
  const snapshot = logs.slice()
  listeners.forEach((listener) => listener(snapshot))
}

export function addLog({ level = 'info', event = 'app.log', message, meta } = {}) {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    timestamp: new Date().toISOString(),
    level,
    event,
    message: message || '',
    meta: meta || {},
  }
  const lastEntry = logs[logs.length - 1]
  const now = Date.now()
  let grouped = false
  if (
    lastEntry
    && lastEntry.level === level
    && lastEntry.event === event
    && lastEntry.message === (message || '')
    && (now - new Date(lastEntry.timestamp).getTime()) <= GROUP_WINDOW_MS
  ) {
    lastEntry.count = (lastEntry.count || 1) + 1
    lastEntry.timestamp = new Date().toISOString()
    if (meta && Object.keys(meta).length) {
      lastEntry.meta = { ...lastEntry.meta, ...meta }
    }
    grouped = true
  } else {
    logs.push(entry)
  }
  if (logs.length > MAX_LOGS) {
    logs.splice(0, logs.length - MAX_LOGS)
  }
  persistLogs()
  notify()
  return grouped ? lastEntry : entry
}

export function getLogs() {
  return logs.slice()
}

export function subscribeLogs(listener) {
  listeners.add(listener)
  listener(logs.slice())
  return () => listeners.delete(listener)
}
