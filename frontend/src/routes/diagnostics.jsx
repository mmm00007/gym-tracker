import { useEffect, useMemo, useState } from 'react'
import { TopAppBar, IconButton } from '../components/uiPrimitives'
import { supabase } from '../lib/supabase'
import { API_BASE_URL, pingHealth } from '../lib/api'
import { addLog, subscribeLogs } from '../lib/logs'
import { useAppRouteContext } from './useAppRouteContext'

const HISTORICAL_SAMPLE_DAYS = 90
const HISTORICAL_SPLIT_TEMPLATES = {
  push: [
    { keywords: ['chest press', 'bench press'], fallbackMuscles: ['Chest'], startWeight: 35, weeklyIncrement: 1.25, setType: 'top', reps: [8, 8, 7] },
    { keywords: ['incline', 'pec'], fallbackMuscles: ['Chest'], startWeight: 22.5, weeklyIncrement: 1.0, reps: [12, 10, 9] },
    { keywords: ['shoulder press', 'overhead'], fallbackMuscles: ['Shoulders'], startWeight: 20, weeklyIncrement: 1.0, reps: [10, 9, 8] },
    { keywords: ['tricep', 'pushdown'], fallbackMuscles: ['Arms'], startWeight: 18, weeklyIncrement: 0.75, reps: [12, 11, 10] },
  ],
  pull: [
    { keywords: ['lat pulldown', 'pulldown'], fallbackMuscles: ['Back'], startWeight: 40, weeklyIncrement: 1.25, setType: 'top', reps: [9, 8, 8] },
    { keywords: ['row'], fallbackMuscles: ['Back'], startWeight: 35, weeklyIncrement: 1.25, reps: [11, 10, 9] },
    { keywords: ['rear delt', 'face pull'], fallbackMuscles: ['Shoulders', 'Back'], startWeight: 14, weeklyIncrement: 0.5, reps: [14, 13, 12] },
    { keywords: ['bicep', 'curl'], fallbackMuscles: ['Arms'], startWeight: 12, weeklyIncrement: 0.5, reps: [12, 11, 10] },
  ],
  legs: [
    { keywords: ['leg press', 'hack squat', 'squat'], fallbackMuscles: ['Legs'], startWeight: 90, weeklyIncrement: 2.5, setType: 'top', reps: [10, 9, 8] },
    { keywords: ['romanian deadlift', 'rdl', 'deadlift'], fallbackMuscles: ['Legs', 'Back'], startWeight: 45, weeklyIncrement: 2.0, reps: [10, 9, 8] },
    { keywords: ['leg curl', 'hamstring'], fallbackMuscles: ['Legs'], startWeight: 28, weeklyIncrement: 1.0, reps: [12, 11, 10] },
    { keywords: ['leg extension', 'quad'], fallbackMuscles: ['Legs'], startWeight: 24, weeklyIncrement: 1.0, reps: [14, 12, 11] },
  ],
}

const clampWeight = (weight) => Math.max(2.5, Math.round(weight * 2) / 2)

const pickMachineByTemplate = (machines, template, usedMachineIds) => {
  const availableMachines = machines.filter((machine) => !usedMachineIds.has(machine.id))
  const byKeyword = availableMachines.find((machine) => {
    const movement = String(machine.movement || machine.name || '').toLowerCase()
    return template.keywords.some((keyword) => movement.includes(keyword))
  })
  if (byKeyword) return byKeyword

  return availableMachines.find((machine) => {
    const groups = Array.isArray(machine.muscle_groups) ? machine.muscle_groups : []
    return groups.some((muscle) => template.fallbackMuscles.includes(muscle))
  }) || null
}

const buildHistoricalSetRows = (machines, userId, days = HISTORICAL_SAMPLE_DAYS) => {
  if (!Array.isArray(machines) || !machines.length || !userId) return { rows: [], sessionCount: 0 }

  const today = new Date()
  const rows = []
  let trainingDayCount = 0
  let completedSessionCount = 0
  const splitOrder = ['push', 'pull', 'legs']

  for (let daysAgo = days - 1; daysAgo >= 1; daysAgo -= 1) {
    const date = new Date(today)
    date.setDate(today.getDate() - daysAgo)

    const dayOfWeek = date.getDay()
    const isPrimaryDay = dayOfWeek === 1 || dayOfWeek === 3 || dayOfWeek === 5
    const isOptionalFourthDay = dayOfWeek === 6 && (Math.floor(daysAgo / 7) % 2 === 0)
    if (!isPrimaryDay && !isOptionalFourthDay) continue

    trainingDayCount += 1
    if (trainingDayCount % 6 === 0) continue

    const split = splitOrder[completedSessionCount % splitOrder.length]
    const templates = HISTORICAL_SPLIT_TEMPLATES[split]
    const usedMachineIds = new Set()
    const machineWork = templates
      .map((template) => {
        const machine = pickMachineByTemplate(machines, template, usedMachineIds)
        if (!machine) return null
        usedMachineIds.add(machine.id)
        return { machine, template }
      })
      .filter(Boolean)

    if (!machineWork.length) continue

    const weekIndex = Math.floor(completedSessionCount / 3)
    const isDeloadWeek = weekIndex > 0 && weekIndex % 6 === 0
    const localStartHour = 17 + (completedSessionCount % 3)
    const localStartMinute = [10, 20, 35, 15][completedSessionCount % 4]

    machineWork.forEach(({ machine, template }, machineIdx) => {
      const baseWeight = template.startWeight + weekIndex * template.weeklyIncrement
      const deloadFactor = isDeloadWeek ? 0.92 : 1
      const workingWeight = clampWeight(baseWeight * deloadFactor)

      template.reps.forEach((baseReps, setIdx) => {
        const loggedAt = new Date(date)
        loggedAt.setHours(localStartHour, localStartMinute + machineIdx * 13 + setIdx * 4, 0, 0)
        const fatigueDrop = setIdx === 2 ? 1 : 0
        const repAdjustment = (completedSessionCount + machineIdx + setIdx) % 5 === 0 ? -1 : 0
        rows.push({
          user_id: userId,
          machine_id: machine.id,
          reps: Math.max(5, baseReps + repAdjustment - fatigueDrop),
          weight: clampWeight(workingWeight - setIdx * 2.5),
          set_type: setIdx === 0 && template.setType ? template.setType : 'working',
          duration_seconds: null,
          rest_seconds: setIdx === 0 ? 120 : 90,
          logged_at: loggedAt.toISOString(),
        })
      })
    })

    completedSessionCount += 1
  }

  return { rows, sessionCount: completedSessionCount }
}

function BackBtn({ onClick }) {
  return <IconButton onClick={onClick}>← Back</IconButton>
}

export default function DiagnosticsRoute() {
  const {
    machines,
    navigateHome,
    refreshData,
    user,
  } = useAppRouteContext()

  const [logs, setLogs] = useState([])
  const [healthStatus, setHealthStatus] = useState(null)
  const authState = user?.id ? 'authenticated' : 'anonymous'
  const [copyStatus, setCopyStatus] = useState(null)
  const [copyFallback, setCopyFallback] = useState('')
  const [levelFilter, setLevelFilter] = useState('all')
  const [eventFilter, setEventFilter] = useState('')
  const [historicalSeedStatus, setHistoricalSeedStatus] = useState({ state: 'idle', message: '' })

  useEffect(() => {
    const unsubscribe = subscribeLogs(setLogs)
    return () => unsubscribe()
  }, [])

  const handleHealthCheck = async () => {
    setHealthStatus({ state: 'loading' })
    try {
      const result = await pingHealth()
      setHealthStatus({ state: result.ok ? 'ok' : 'error', ...result })
    } catch (error) {
      const message = error?.message || 'Health check failed.'
      addLog({ level: 'error', event: 'health.error', message })
      setHealthStatus({ state: 'error', ok: false, status: 'n/a', body: message })
    }
  }

  const handleCopyLogs = async () => {
    const payload = logs.map((entry) => (
      `${entry.timestamp} [${entry.level}] ${entry.event} ${entry.message} ${Object.keys(entry.meta || {}).length ? JSON.stringify(entry.meta) : ''}${entry.count > 1 ? ` (x${entry.count})` : ''}`
    )).join('\n')
    if (!payload) {
      setCopyStatus('No logs to copy.')
      return
    }
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload)
        setCopyStatus('Logs copied to clipboard.')
        setCopyFallback('')
        addLog({ level: 'info', event: 'logs.copied', message: 'Logs copied to clipboard.' })
      } else {
        setCopyStatus('Clipboard not available on this device.')
        setCopyFallback(payload)
      }
    } catch (error) {
      setCopyStatus('Failed to copy logs.')
      setCopyFallback(payload)
      addLog({ level: 'error', event: 'logs.copy_failed', message: error?.message || 'Copy failed.' })
    }
  }

  const handleSeedHistoricalData = async () => {
    if (!user?.id) {
      setHistoricalSeedStatus({ state: 'error', message: 'You must be logged in to seed data.' })
      return
    }

    const { rows, sessionCount } = buildHistoricalSetRows(machines, user.id)
    if (!rows.length) {
      setHistoricalSeedStatus({ state: 'error', message: 'No compatible exercises found. Add a few exercises first.' })
      return
    }

    setHistoricalSeedStatus({ state: 'loading', message: 'Generating 90 days of sample workouts...' })
    try {
      const { error } = await supabase.from('sets').insert(rows)
      if (error) throw error
      await refreshData?.()
      setHistoricalSeedStatus({
        state: 'success',
        message: `Added ${rows.length} sets across ${sessionCount} training days over the last ${HISTORICAL_SAMPLE_DAYS} days.`,
      })
      addLog({
        level: 'info',
        event: 'diagnostics.seed_historical_data',
        message: 'Inserted hardcoded historical training data.',
        meta: { rows: rows.length, sessions: sessionCount, days: HISTORICAL_SAMPLE_DAYS },
      })
    } catch (error) {
      setHistoricalSeedStatus({ state: 'error', message: error?.message || 'Failed to seed historical data.' })
      addLog({
        level: 'error',
        event: 'diagnostics.seed_historical_data_failed',
        message: error?.message || 'Failed to seed historical data.',
      })
    }
  }

  const filteredLogs = useMemo(() => {
    const normalizedEvent = eventFilter.trim().toLowerCase()
    return logs.filter((entry) => {
      const levelOk = levelFilter === 'all' || entry.level === levelFilter
      const eventOk = !normalizedEvent || entry.event.toLowerCase().includes(normalizedEvent)
      return levelOk && eventOk
    })
  }, [logs, levelFilter, eventFilter])
  const recentLogs = filteredLogs.slice(-20).reverse()
  const expiresAt = 'n/a'

  return (
    <div className="screen-frame">
      <TopAppBar left={<BackBtn onClick={navigateHome} />} title="DIAGNOSTICS" />

      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 16, border: '1px solid var(--border)', marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: 1, fontFamily: 'var(--font-code)', marginBottom: 6 }}>API BASE URL</div>
        <div style={{ fontSize: 14, color: 'var(--text)', wordBreak: 'break-all' }}>{API_BASE_URL}</div>
      </div>

      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 16, border: '1px solid var(--border)', marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: 1, fontFamily: 'var(--font-code)', marginBottom: 6 }}>AUTH STATE</div>
        <div style={{ fontSize: 14, color: 'var(--text)' }}>
          <div>Status: {authState}</div>
          <div>User ID: {user?.id || 'n/a'}</div>
          <div>Session expires: {expiresAt}</div>
        </div>
      </div>

      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 16, border: '1px solid var(--border)', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: 1, fontFamily: 'var(--font-code)' }}>API HEALTH CHECK</div>
          <button onClick={handleHealthCheck} style={{
            padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)',
            color: 'var(--text)', fontSize: 12, fontWeight: 600,
          }}>Ping</button>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text)' }}>
          {healthStatus?.state === 'loading' && 'Checking...'}
          {!healthStatus && 'No health check run yet.'}
          {healthStatus?.state === 'ok' && `OK (${healthStatus.status})`}
          {healthStatus?.state === 'error' && `Error (${healthStatus.status || 'n/a'}): ${healthStatus.body || ''}`}
        </div>
      </div>

      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 16, border: '1px solid var(--border)', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: 1, fontFamily: 'var(--font-code)' }}>SAMPLE DATA</div>
          <button onClick={handleSeedHistoricalData} disabled={historicalSeedStatus.state === 'loading'} style={{
            padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)',
            color: 'var(--text)', fontSize: 12, fontWeight: 600, opacity: historicalSeedStatus.state === 'loading' ? 0.7 : 1,
          }}>Simulate historical data</button>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Inserts hardcoded Push/Pull/Legs workouts for the last {HISTORICAL_SAMPLE_DAYS} days at a realistic 3–4 day/week cadence with occasional missed days.
        </div>
        {historicalSeedStatus.message && (
          <div style={{
            marginTop: 8,
            fontSize: 12,
            color: historicalSeedStatus.state === 'error' ? 'var(--red)' : 'var(--text-dim)',
          }}>
            {historicalSeedStatus.message}
          </div>
        )}
      </div>

      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 16, border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: 1, fontFamily: 'var(--font-code)' }}>RECENT LOGS (last 20)</div>
          <button onClick={handleCopyLogs} style={{
            padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)',
            color: 'var(--text)', fontSize: 12, fontWeight: 600,
          }}>Copy logs</button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          {['all', 'info', 'error'].map((level) => (
            <button key={level} onClick={() => setLevelFilter(level)} style={{
              padding: '4px 10px', borderRadius: 999, border: '1px solid var(--border)',
              background: levelFilter === level ? 'var(--surface2)' : 'transparent',
              color: levelFilter === level ? 'var(--text)' : 'var(--text-dim)', fontSize: 11,
            }}>{level.toUpperCase()}</button>
          ))}
          <input value={eventFilter} onChange={(e) => setEventFilter(e.target.value)}
            placeholder="Filter by event"
            style={{
              flex: 1, minWidth: 140, padding: '4px 10px', borderRadius: 999, border: '1px solid var(--border)',
              background: 'var(--surface2)', color: 'var(--text)', fontSize: 11,
            }} />
        </div>
        {copyStatus && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8 }}>{copyStatus}</div>}
        {copyFallback && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>Select and copy the logs below:</div>
            <textarea readOnly value={copyFallback} rows={4}
              style={{
                width: '100%', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface2)',
                color: 'var(--text)', fontSize: 11, padding: 8, boxSizing: 'border-box',
              }} />
          </div>
        )}
        {recentLogs.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>No logs captured yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {recentLogs.map((entry) => (
              <div key={entry.id} style={{
                borderRadius: 10, background: 'var(--surface2)', padding: 10, border: '1px solid var(--border)',
                fontSize: 12, color: 'var(--text)',
              }}>
                <div style={{ fontFamily: 'var(--font-code)', color: 'var(--text-dim)', marginBottom: 4 }}>
                  {new Date(entry.timestamp).toLocaleString()} · {entry.level.toUpperCase()}{entry.count > 1 ? ` · x${entry.count}` : ''}
                </div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{entry.event}</div>
                <div style={{ color: 'var(--text-muted)', marginBottom: entry.meta && Object.keys(entry.meta).length ? 6 : 0 }}>
                  {entry.message}
                </div>
                {entry.meta && Object.keys(entry.meta).length > 0 && (
                  <pre style={{
                    margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'var(--font-code)',
                    fontSize: 11, color: 'var(--text-dim)',
                  }}>
                    {JSON.stringify(entry.meta, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
