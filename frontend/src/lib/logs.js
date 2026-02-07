const MAX_LOGS = 200
const logs = []
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
  logs.push(entry)
  if (logs.length > MAX_LOGS) {
    logs.splice(0, logs.length - MAX_LOGS)
  }
  notify()
  return entry
}

export function getLogs() {
  return logs.slice()
}

export function subscribeLogs(listener) {
  listeners.add(listener)
  listener(logs.slice())
  return () => listeners.delete(listener)
}
