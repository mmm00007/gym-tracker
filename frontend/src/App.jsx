import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  supabase, signUp, signIn, signOut, getSession,
  getMachines, upsertMachine, deleteMachine as dbDeleteMachine,
  getSets, logSet as dbLogSet, deleteSet as dbDeleteSet,
  bootstrapDefaultEquipmentCatalog,
  getPendingSoreness, submitSoreness, getRecentSoreness,
  getAnalysisReports, getAnalysisReport,
} from './lib/supabase'
import { API_BASE_URL, pingHealth, getRecommendations } from './lib/api'
import { getFeatureFlags, DEFAULT_FLAGS } from './lib/featureFlags'
import { addLog, subscribeLogs } from './lib/logs'

// ─── Helpers ───────────────────────────────────────────────
const fmt = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const fmtFull = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const fmtTime = (d) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
const fmtDur = (ms) => { const m = Math.floor(ms / 60000); return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m` }
const fmtTimer = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

const fmtNumber = (value, digits = 1) => {
  if (!Number.isFinite(value)) return '0'
  return value.toLocaleString('en-GB', { maximumFractionDigits: digits, minimumFractionDigits: value % 1 ? digits : 0 })
}

const estimate1RM = (weight, reps) => weight * (1 + reps / 30)
const SET_TYPE_OPTIONS = ['warmup', 'working', 'top', 'drop', 'backoff', 'failure']
const EQUIPMENT_TYPE_OPTIONS = ['machine', 'freeweight', 'bodyweight', 'cable', 'band', 'other']
const TREND_TIMEFRAME_OPTIONS = [
  { key: '1d', label: '1D', ms: 24 * 60 * 60 * 1000 },
  { key: '1w', label: '1W', ms: 7 * 24 * 60 * 60 * 1000 },
  { key: '1m', label: '1M', ms: 30 * 24 * 60 * 60 * 1000 },
]

const isBodyweightExercise = (machine) => machine?.equipment_type === 'bodyweight'

const weightLabelForMachine = (machine) => (isBodyweightExercise(machine) ? 'Additional weight' : 'Weight')

const filterSetsByType = (sets, setTypes) => {
  if (!setTypes?.length) return sets
  return sets.filter((set) => setTypes.includes(set.set_type || 'working'))
}

const buildMetrics = (sets) => {
  if (!sets.length) {
    return {
      totalVolume: 0,
      totalSets: 0,
      totalReps: 0,
      avgLoad: 0,
      avgRepsPerSet: 0,
      maxStandardized: 0,
      estOneRm: 0,
      hardSets: 0,
      bestSet: null,
      maxWeight: 0,
      avgTimedDuration: null,
      timedSetCount: 0,
    }
  }
  const totalSets = sets.length
  const totalReps = sets.reduce((sum, s) => sum + s.reps, 0)
  const totalVolume = sets.reduce((sum, s) => sum + s.reps * s.weight, 0)
  const avgLoad = totalReps ? totalVolume / totalReps : 0
  const avgRepsPerSet = totalSets ? totalReps / totalSets : 0
  const maxWeight = Math.max(...sets.map(s => s.weight))
  const standardizedCandidates = sets.filter(s => s.reps >= 5 && s.reps <= 8)
  const maxStandardized = standardizedCandidates.length
    ? Math.max(...standardizedCandidates.map(s => s.weight))
    : maxWeight
  let bestSet = null
  let estOneRm = 0
  sets.forEach((s) => {
    const estimate = estimate1RM(s.weight, s.reps)
    if (estimate > estOneRm) {
      estOneRm = estimate
      bestSet = s
    }
  })
  const hardSets = sets.filter(s => s.reps <= 8 || s.weight >= maxWeight * 0.9).length
  const timedSets = sets.filter((s) => s.duration_seconds !== null && s.duration_seconds !== undefined)
  const avgTimedDuration = timedSets.length
    ? timedSets.reduce((sum, s) => sum + s.duration_seconds, 0) / timedSets.length
    : null
  return {
    totalVolume,
    totalSets,
    totalReps,
    avgLoad,
    avgRepsPerSet,
    maxStandardized,
    estOneRm,
    hardSets,
    bestSet,
    maxWeight,
    avgTimedDuration,
    timedSetCount: timedSets.length,
  }
}

const buildTrainingBuckets = (sets, machines) => {
  const buckets = new Map()

  sets.forEach((set) => {
    const bucketId = set.training_bucket_id || `training_day:${new Date(set.logged_at).toISOString().slice(0, 10)}`
    const existing = buckets.get(bucketId) || {
      training_bucket_id: bucketId,
      training_date: set.training_date || bucketId.replace('training_day:', ''),
      workout_cluster_id: set.workout_cluster_id || null,
      workout_cluster_ids: [],
      started_at: set.logged_at,
      ended_at: set.logged_at,
      sets: [],
    }

    if (set.workout_cluster_id && !existing.workout_cluster_ids.includes(set.workout_cluster_id)) {
      existing.workout_cluster_ids.push(set.workout_cluster_id)
    }

    existing.workout_cluster_id = existing.workout_cluster_ids.length === 1
      ? existing.workout_cluster_ids[0]
      : null

    existing.sets.push({
      machine_id: set.machine_id,
      machine_name: machines.find((m) => m.id === set.machine_id)?.movement || 'Unknown',
      reps: set.reps,
      weight: set.weight,
      set_type: set.set_type || 'working',
      duration_seconds: set.duration_seconds ?? null,
      rest_seconds: set.rest_seconds ?? null,
      logged_at: set.logged_at,
      workout_cluster_id: set.workout_cluster_id || null,
    })

    if (new Date(set.logged_at) < new Date(existing.started_at)) existing.started_at = set.logged_at
    if (new Date(set.logged_at) > new Date(existing.ended_at)) existing.ended_at = set.logged_at

    buckets.set(bucketId, existing)
  })

  return [...buckets.values()].sort((a, b) => new Date(a.started_at) - new Date(b.started_at))
}

const MUSCLE_COLORS = {
  Chest: '#ff6b6b', Back: '#4ecdc4', Shoulders: '#ffe66d', Biceps: '#ff8a5c',
  Triceps: '#a8e6cf', Legs: '#88d8b0', Core: '#ffd93d', Glutes: '#c9b1ff',
  Calves: '#6bcb77', Forearms: '#ffa07a', Hamstrings: '#ff8a5c', Quadriceps: '#88d8b0',
}
const mc = (m) => MUSCLE_COLORS[m] || '#888'

const SORENESS_LABELS = ['None', 'Mild', 'Moderate', 'Very Sore', 'Extreme']
const SORENESS_EMOJI = ['😊', '🙂', '😐', '😣', '🤕']

// ─── Shared Components ─────────────────────────────────────

function TopBar({ left, title, right }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, padding: '12px 0' }}>
      <div style={{ width: 70, textAlign: 'left' }}>{left}</div>
      <span style={{ fontSize: 13, color: 'var(--text-dim)', fontFamily: 'var(--font-code)', letterSpacing: 1 }}>{title}</span>
      <div style={{ width: 70, textAlign: 'right' }}>{right}</div>
    </div>
  )
}

function BackBtn({ onClick }) {
  return <button onClick={onClick} style={{ color: 'var(--text-muted)', fontSize: 15, padding: 4 }}>← Back</button>
}

function Pill({ text, color }) {
  return (
    <span style={{
      fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600,
      background: (color || '#888') + '22', color: color || '#888', border: `1px solid ${(color || '#888')}33`,
    }}>{text}</span>
  )
}

function SliderInput({ label, value, onChange, min, max, step, unit, color }) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--text-dim)', letterSpacing: 1, textTransform: 'uppercase', fontFamily: 'var(--font-code)' }}>{label}</span>
        <span style={{ fontSize: 28, fontWeight: 800, color, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
          {value}<span style={{ fontSize: 13, color: 'var(--text-dim)', marginLeft: 2 }}>{unit}</span>
        </span>
      </div>
      <div style={{ position: 'relative', height: 48, display: 'flex', alignItems: 'center' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, height: 6, background: 'var(--border)', borderRadius: 3 }}>
          <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg, ${color}88, ${color})`, borderRadius: 3, transition: 'width 0.1s' }} />
        </div>
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ position: 'absolute', width: '100%', height: 48, opacity: 0, cursor: 'pointer', margin: 0, zIndex: 2 }} />
        <div style={{
          position: 'absolute', left: `calc(${pct}% - 20px)`, width: 40, height: 40,
          borderRadius: 10, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 0 20px ${color}44`, transition: 'left 0.1s', pointerEvents: 'none',
          fontSize: 15, fontWeight: 700, color: '#000',
        }}>{value}</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-code)' }}>
        <span>{min}</span><span>{max}</span>
      </div>
    </div>
  )
}

function QuickAdjust({ value, onChange, step, color, min = 0 }) {
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: -8, marginBottom: 14 }}>
      {[-step * 5, -step, step, step * 5].map((d, i) => (
        <button key={i} onClick={() => onChange(Math.max(min, value + d))} style={{
          background: d < 0 ? '#1a1a2e' : '#1a2e1a', border: `1px solid ${d < 0 ? 'var(--red)' : color}44`,
          color: d < 0 ? 'var(--red)' : color, borderRadius: 8, padding: '6px 14px', fontSize: 14,
          fontWeight: 700, fontFamily: 'var(--font-mono)',
        }}>{d > 0 ? '+' : ''}{d}</button>
      ))}
    </div>
  )
}

function MachineCard({ machine, onSelect, onEdit, compact }) {
  const primaryColor = mc(machine.muscle_groups?.[0])
  const thumbnails = machine.thumbnails || []
  const thumb = thumbnails[0]
  return (
    <div onClick={onSelect} style={{
      background: 'linear-gradient(135deg, var(--surface), var(--surface2))', border: '1px solid var(--border)',
      borderRadius: 14, padding: compact ? 12 : 16, cursor: 'pointer', borderLeft: `3px solid ${primaryColor}`,
    }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{
          width: compact ? 48 : 60, height: compact ? 48 : 60, borderRadius: 12, overflow: 'hidden', flexShrink: 0,
          background: 'var(--surface2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-dim)', fontSize: 20, position: 'relative',
        }}>
          {thumb ? (
            <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span>🏋️</span>
          )}
          {thumbnails.length > 1 && (
            <div style={{
              position: 'absolute', bottom: 4, right: 4, background: 'rgba(0,0,0,0.6)', color: '#fff',
              fontSize: 10, padding: '2px 6px', borderRadius: 999, fontWeight: 700,
            }}>+{thumbnails.length - 1}</div>
          )}
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>{machine.name}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>{machine.movement}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {machine.muscle_groups?.map((m, i) => <Pill key={i} text={m} color={mc(m)} />)}
            </div>
          </div>
          {onEdit && (
            <button onClick={(e) => { e.stopPropagation(); onEdit() }} style={{
              border: '1px solid var(--border-light)', borderRadius: 8, color: 'var(--text-muted)',
              padding: '4px 10px', fontSize: 12, height: 'fit-content',
            }}>✎</button>
          )}
        </div>
      </div>
    </div>
  )
}

function RestTimer({ seconds }) {
  return (
    <div style={{
      background: 'var(--surface2)', borderRadius: 14, padding: '14px 18px', marginBottom: 16,
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      border: '1px solid var(--border)',
    }}>
      <div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: 1, fontFamily: 'var(--font-code)' }}>REST TIMER</div>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--blue)' }}>{fmtTimer(seconds)}</div>
    </div>
  )
}

function MiniBarChart({ values, color, height = 60 }) {
  const max = Math.max(...values, 0)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height }}>
      {values.map((v, i) => (
        <div key={i} style={{
          flex: 1,
          height: max ? `${Math.max(8, (v / max) * height)}px` : '8px',
          background: `linear-gradient(180deg, ${color}cc, ${color}44)`,
          borderRadius: 6,
        }} />
      ))}
    </div>
  )
}

function MiniLineChart({ points, color, height = 70 }) {
  if (!points.length) return null
  const width = 300
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = Math.max(max - min, 1)
  const coords = points.map((value, index) => {
    const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * width
    const y = height - (((value - min) / range) * (height - 10) + 5)
    return `${x},${y}`
  })
  const polylinePoints = coords.join(' ')

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height }} role="img" aria-label="Volume trend line chart">
      <line x1="0" y1={height - 1} x2={width} y2={height - 1} stroke="var(--border)" strokeWidth="1" />
      <polyline fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" points={polylinePoints} />
      {coords.map((point, index) => {
        const [cx, cy] = point.split(',')
        return <circle key={index} cx={cx} cy={cy} r="3" fill={color} />
      })}
    </svg>
  )
}

function MetricCard({ label, value, sub }) {
  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 12, padding: 12, border: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', gap: 4, minWidth: 120,
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: 1, fontFamily: 'var(--font-code)' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  )
}

// ─── Auth Screen ───────────────────────────────────────────

function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!username.trim() || !password) return
    setError(null)
    setLoading(true)
    try {
      if (mode === 'login') {
        await signIn(username, password)
      } else {
        if (password.length < 6) { setError('Password must be at least 6 characters'); setLoading(false); return }
        if (username.trim().length < 3) { setError('Username must be at least 3 characters'); setLoading(false); return }
        if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) { setError('Username: letters, numbers, underscores only'); setLoading(false); return }
        await signUp(username, password)
      }
      onAuth()
    } catch (e) {
      const msg = e.message || ''
      if (msg.includes('Invalid login')) setError('Wrong username or password')
      else if (msg.includes('already registered')) setError('Username already taken')
      else setError(msg)
    }
    setLoading(false)
  }

  return (
    <div style={{ padding: '20px 16px', minHeight: '100dvh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <div style={{ fontSize: 13, letterSpacing: 6, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 8, fontFamily: 'var(--font-code)' }}>iron</div>
        <h1 style={{ fontSize: 48, fontWeight: 900, margin: 0, background: 'linear-gradient(135deg, var(--accent), var(--blue))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontFamily: 'var(--font-mono)', letterSpacing: -2 }}>TRACKER</h1>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username"
          autoCapitalize="none" autoCorrect="off" spellCheck={false}
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, color: 'var(--text)', fontSize: 16 }} />
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password"
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, color: 'var(--text)', fontSize: 16 }} />

        {error && <div style={{ color: 'var(--red)', fontSize: 13, textAlign: 'center' }}>{error}</div>}

        <button onClick={handleSubmit} disabled={loading} style={{
          padding: 16, borderRadius: 12, fontSize: 17, fontWeight: 800, fontFamily: 'var(--font-mono)',
          background: 'linear-gradient(135deg, var(--accent), var(--accent-dark))', color: '#000',
          opacity: loading ? 0.6 : 1,
        }}>{loading ? '...' : mode === 'login' ? 'Sign In' : 'Create Account'}</button>

        <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null) }} style={{
          color: 'var(--text-muted)', fontSize: 14, padding: 8, textAlign: 'center',
        }}>{mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}</button>
      </div>
    </div>
  )
}

// ─── Soreness Modal ────────────────────────────────────────

function SorenessPrompt({ session, muscleGroups, onSubmit, onDismiss }) {
  const [levels, setLevels] = useState(() => {
    const init = {}
    muscleGroups.forEach(m => { init[m] = 1 })
    return init
  })

  const handleSubmit = () => {
    const reports = Object.entries(levels).map(([muscleGroup, level]) => ({ muscleGroup, level }))
    onSubmit(session.training_bucket_id, reports)
  }

  return (
    <div className="fade-in" style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16,
      padding: 20, marginBottom: 16,
    }}>
      <div style={{ fontSize: 13, color: 'var(--accent)', letterSpacing: 2, fontFamily: 'var(--font-code)', marginBottom: 4 }}>
        SORENESS CHECK
      </div>
      <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 16 }}>
        How sore are you from your {fmt(session.ended_at)} workout?
      </div>

      {muscleGroups.map(muscle => (
        <div key={muscle} style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 14, color: 'var(--text)', fontWeight: 600 }}>{muscle}</span>
            <span style={{ fontSize: 13, color: mc(muscle) }}>
              {SORENESS_EMOJI[levels[muscle]]} {SORENESS_LABELS[levels[muscle]]}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[0, 1, 2, 3, 4].map(lvl => (
              <button key={lvl} onClick={() => setLevels({ ...levels, [muscle]: lvl })} style={{
                flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 13, fontWeight: 600,
                background: levels[muscle] === lvl ? mc(muscle) + '33' : 'var(--surface2)',
                color: levels[muscle] === lvl ? mc(muscle) : 'var(--text-dim)',
                border: levels[muscle] === lvl ? `1px solid ${mc(muscle)}66` : '1px solid var(--border)',
              }}>{lvl}</button>
            ))}
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button onClick={handleSubmit} style={{
          flex: 1, padding: 14, borderRadius: 12, background: 'var(--accent)', color: '#000',
          fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-mono)',
        }}>Submit</button>
        <button onClick={onDismiss} style={{
          padding: 14, borderRadius: 12, border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 14,
        }}>Skip</button>
      </div>
    </div>
  )
}

// ─── Home Screen ───────────────────────────────────────────

function HomeScreen({
  pendingSoreness,
  machines,
  libraryEnabled,
  onLogSets,
  onLibrary,
  onAnalysis,
  onHistory,
  onDiagnostics,
  onSorenessSubmit,
  onSorenessDismiss,
  onSignOut,
}) {
  return (
    <div style={{ padding: '20px 16px', minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div />
        <button onClick={onSignOut} style={{ color: 'var(--text-dim)', fontSize: 12, padding: 8 }}>Sign out</button>
      </div>

      <div style={{ textAlign: 'center', marginTop: 24, marginBottom: 32 }}>
        <div style={{ fontSize: 13, letterSpacing: 6, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 8, fontFamily: 'var(--font-code)' }}>iron</div>
        <h1 style={{ fontSize: 48, fontWeight: 900, margin: 0, background: 'linear-gradient(135deg, var(--accent), var(--blue))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontFamily: 'var(--font-mono)', letterSpacing: -2 }}>TRACKER</h1>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8, letterSpacing: 3, fontFamily: 'var(--font-code)' }}>AI-POWERED GYM LOG</div>
      </div>

      {pendingSoreness.map(s => {
        const sessionMuscles = [...new Set(
          (s._sets || []).flatMap(set => {
            const m = machines.find(ma => ma.id === set.machine_id)
            return m?.muscle_groups || []
          })
        )]
        if (!sessionMuscles.length) return null
        return (
          <SorenessPrompt key={s.id} session={s} muscleGroups={sessionMuscles}
            onSubmit={onSorenessSubmit} onDismiss={() => onSorenessDismiss(s.training_bucket_id)} />
        )
      })}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button onClick={onLogSets} style={{
          background: 'linear-gradient(135deg, var(--accent), var(--accent-dark))', borderRadius: 16,
          padding: 22, textAlign: 'left', boxShadow: '0 0 40px var(--accent)22',
        }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#000', fontFamily: 'var(--font-mono)' }}>📝 Log Sets</div>
          <div style={{ fontSize: 13, color: '#022', marginTop: 4 }}>Capture sets directly without starting a session</div>
        </button>

        {libraryEnabled && (
          <button onClick={onLibrary} style={{
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, textAlign: 'left',
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>📚 Library</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Manage exercises and defaults</div>
          </button>
        )}

        <button onClick={onAnalysis} style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, textAlign: 'left',
        }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>📈 Analyze</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Detailed progression and set-type insights</div>
        </button>

        <button onClick={onHistory} style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, textAlign: 'left',
        }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>📊 History</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Training-day timeline and recent sets</div>
        </button>

        <button onClick={onDiagnostics} style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, textAlign: 'left',
        }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>🧰 Diagnostics</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Check API health and share logs</div>
        </button>
      </div>
    </div>
  )
}


// ─── Edit Machine ──────────────────────────────────────────

function EditMachineScreen({ machine, onSave, onCancel, onDelete }) {
  const [form, setForm] = useState({
    equipment_type: 'machine',
    ...machine,
  })
  const upd = (k, v) => setForm({ ...form, [k]: v })
  const thumbRef = useRef(null)
  const instructionRef = useRef(null)

  const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read image file.'))
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Invalid image data.'))
        return
      }
      resolve(reader.result)
    }
    reader.readAsDataURL(file)
  })

  const addThumbnails = async (files) => {
    if (!files?.length) return
    const existing = form.thumbnails || []
    const incoming = Array.from(files).slice(0, 4 - existing.length)
    const dataUrls = []
    for (const file of incoming) {
      try {
        dataUrls.push(await readFileAsDataUrl(file))
      } catch (err) {
        console.error(err)
      }
    }
    if (dataUrls.length) {
      upd('thumbnails', [...existing, ...dataUrls])
    }
  }

  const setInstructionImage = async (file) => {
    if (!file) return
    try {
      const dataUrl = await readFileAsDataUrl(file)
      upd('instruction_image', dataUrl)
    } catch (err) {
      console.error(err)
    }
  }

  const fields = [
    ['name', 'Exercise Name', 'text'],
    ['movement', 'Movement', 'text'],
    ['exercise_type', 'Classification (Push/Pull/Legs/Core)', 'text'],
    ['source', 'Source', 'text'],
    ['notes', 'Coaching Notes', 'textarea'],
  ]

  const isMachineType = form.equipment_type === 'machine'

  const buildPayload = () => {
    const payload = {
      ...form,
      name: (form.name || '').trim(),
      movement: (form.movement || '').trim(),
      exercise_type: (form.exercise_type || '').trim() || null,
      notes: (form.notes || '').trim() || null,
      source: (form.source || '').trim() || null,
      equipment_type: form.equipment_type || 'machine',
      muscle_groups: (form.muscle_groups || []).map((m) => m.trim()).filter(Boolean),
    }

    if (payload.equipment_type !== 'machine') {
      payload.thumbnails = []
      payload.instruction_image = null
      payload.source = null
    }

    return payload
  }

  return (
    <div style={{ padding: '20px 16px', minHeight: '100dvh' }}>
      <TopBar left={<BackBtn onClick={onCancel} />} title="EDIT EXERCISE" />

      {fields.map(([key, label, type]) => (
        <div key={key} style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 6, fontFamily: 'var(--font-code)' }}>{label}</label>
          {type === 'textarea' ? (
            <textarea value={form[key] || ''} onChange={(e) => upd(key, e.target.value)} rows={3}
              style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, color: 'var(--text)', fontSize: 16, resize: 'vertical', boxSizing: 'border-box' }} />
          ) : (
            <input value={form[key] || ''} onChange={(e) => upd(key, e.target.value)}
              style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, color: 'var(--text)', fontSize: 16, boxSizing: 'border-box' }} />
          )}
        </div>
      ))}

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 6, fontFamily: 'var(--font-code)' }}>Equipment Type</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {EQUIPMENT_TYPE_OPTIONS.map((type) => {
            const active = form.equipment_type === type
            return (
              <button key={type} onClick={() => upd('equipment_type', type)} style={{
                textTransform: 'capitalize',
                padding: '6px 12px', borderRadius: 999, border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                background: active ? 'var(--accent)22' : 'var(--surface2)', color: active ? 'var(--accent)' : 'var(--text-muted)',
                fontSize: 12, fontWeight: 700,
              }}>{type}</button>
            )
          })}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 6, fontFamily: 'var(--font-code)' }}>Muscle Groups (comma-separated)</label>
        <input value={(form.muscle_groups || []).join(', ')}
          onChange={(e) => upd('muscle_groups', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
          style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, color: 'var(--text)', fontSize: 16, boxSizing: 'border-box' }} />
      </div>

      {isMachineType ? (
        <>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 6, fontFamily: 'var(--font-code)' }}>Machine Thumbnails</label>
            <input ref={thumbRef} type="file" accept="image/*" multiple
              onChange={async (e) => { await addThumbnails(e.target.files); e.target.value = '' }}
              style={{ display: 'none' }} />
            <button onClick={() => thumbRef.current?.click()} style={{
              padding: '10px 14px', borderRadius: 10, fontSize: 14, fontWeight: 700,
              background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)',
            }}>Add thumbnails</button>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 6 }}>{(form.thumbnails || []).length}/4 selected</div>
            {(form.thumbnails || []).length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                {form.thumbnails.map((thumb, i) => (
                  <div key={i} style={{ position: 'relative' }}>
                    <img src={thumb} alt="" style={{ width: 78, height: 78, objectFit: 'cover', borderRadius: 12, border: '1px solid var(--border)' }} />
                    <button onClick={() => upd('thumbnails', form.thumbnails.filter((_, idx) => idx !== i))} style={{
                      position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11,
                      background: 'var(--red)', color: '#fff', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 6, fontFamily: 'var(--font-code)' }}>Instruction Image</label>
            <input ref={instructionRef} type="file" accept="image/*"
              onChange={async (e) => { await setInstructionImage(e.target.files?.[0]); e.target.value = '' }}
              style={{ display: 'none' }} />
            <button onClick={() => instructionRef.current?.click()} style={{
              padding: '10px 14px', borderRadius: 10, fontSize: 14, fontWeight: 700,
              background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)',
            }}>{form.instruction_image ? 'Replace instruction image' : 'Add instruction image'}</button>
            {form.instruction_image && (
              <div style={{ marginTop: 10, position: 'relative', width: '100%', maxWidth: 320 }}>
                <img src={form.instruction_image} alt="" style={{ width: '100%', borderRadius: 12, border: '1px solid var(--border)', objectFit: 'cover' }} />
                <button onClick={() => upd('instruction_image', null)} style={{
                  position: 'absolute', top: 8, right: 8, width: 26, height: 26, borderRadius: 13,
                  background: 'var(--red)', color: '#fff', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>×</button>
              </div>
            )}
          </div>
        </>
      ) : (
        <div style={{ marginBottom: 16, padding: 12, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text-dim)', fontSize: 13 }}>
          Media is optional for {form.equipment_type}. Focus on clean naming and muscle-group tagging for consistent library curation.
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
        <button onClick={() => onSave(buildPayload())} style={{
          flex: 1, padding: 16, borderRadius: 12, background: 'var(--accent)', color: '#000',
          fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-mono)',
        }}>Save</button>
        {onDelete && (
          <button onClick={() => onDelete(machine.id)} style={{
            padding: 16, borderRadius: 12, border: '1px solid var(--red)', color: 'var(--red)', fontSize: 15, fontWeight: 600, minWidth: 80,
          }}>Delete</button>
        )}
      </div>
    </div>
  )
}

function LibraryScreen({ machines, onSaveMachine, onDeleteMachine, onBack }) {
  const [editingMachine, setEditingMachine] = useState(null)
  const [search, setSearch] = useState('')
  const [equipmentFilter, setEquipmentFilter] = useState('All')
  const [muscleFilter, setMuscleFilter] = useState('All')

  const muscleGroups = useMemo(
    () => Array.from(new Set(machines.flatMap((m) => m.muscle_groups || []))).sort(),
    [machines],
  )

  const filteredMachines = useMemo(() => {
    const query = search.trim().toLowerCase()
    return machines.filter((machine) => {
      const matchesSearch = !query || [machine.name, machine.movement, machine.notes]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query))
      const matchesType = equipmentFilter === 'All' || (machine.equipment_type || 'machine') === equipmentFilter
      const matchesMuscle = muscleFilter === 'All' || machine.muscle_groups?.includes(muscleFilter)
      return matchesSearch && matchesType && matchesMuscle
    })
  }, [machines, search, equipmentFilter, muscleFilter])

  if (editingMachine) {
    return (
      <EditMachineScreen
        machine={editingMachine}
        onSave={async (machine) => { await onSaveMachine(machine); setEditingMachine(null) }}
        onCancel={() => setEditingMachine(null)}
        onDelete={async (id) => { await onDeleteMachine(id); setEditingMachine(null) }}
      />
    )
  }

  return (
    <div style={{ padding: '20px 16px', minHeight: '100dvh' }}>
      <TopBar left={<BackBtn onClick={onBack} />} title="LIBRARY" right={<button onClick={() => setEditingMachine({})} style={{ fontSize: 13, color: 'var(--accent)' }}>+ Add</button>} />

      <div style={{ marginBottom: 12 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search exercises, movements, notes"
          style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, color: 'var(--text)', fontSize: 14, boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: 1, marginBottom: 8, fontFamily: 'var(--font-code)' }}>EQUIPMENT TYPE</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['All', ...EQUIPMENT_TYPE_OPTIONS].map((type) => {
            const active = equipmentFilter === type
            return (
              <button key={type} onClick={() => setEquipmentFilter(type)} style={{
                textTransform: type === 'All' ? 'none' : 'capitalize',
                padding: '6px 12px', borderRadius: 999, border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                background: active ? 'var(--accent)22' : 'var(--surface2)', color: active ? 'var(--accent)' : 'var(--text-muted)',
                fontSize: 12, fontWeight: 700,
              }}>{type}</button>
            )
          })}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: 1, marginBottom: 8, fontFamily: 'var(--font-code)' }}>MUSCLE GROUP</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['All', ...muscleGroups].map((group) => {
            const active = muscleFilter === group
            return (
              <button key={group} onClick={() => setMuscleFilter(group)} style={{
                padding: '6px 12px', borderRadius: 999, border: `1px solid ${active ? 'var(--blue)' : 'var(--border)'}`,
                background: active ? 'var(--blue)22' : 'var(--surface2)', color: active ? 'var(--blue)' : 'var(--text-muted)',
                fontSize: 12, fontWeight: 700,
              }}>{group}</button>
            )
          })}
        </div>
      </div>

      {machines.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏋️</div>
          <div>No exercises in your library yet.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filteredMachines.length === 0 && (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-dim)', fontSize: 13 }}>
              No entries match your current filters.
            </div>
          )}
          {filteredMachines.map((machine) => (
            <MachineCard key={machine.id} machine={machine} compact onSelect={() => setEditingMachine(machine)} onEdit={() => setEditingMachine(machine)} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Log Set Screen ────────────────────────────────────────

function LogSetScreen({
  sets,
  machines,
  machineHistory,
  onLoadMachineHistory,
  onLogSet,
  onDeleteSet,
  onBack,
  onOpenLibrary,
  libraryEnabled,
  setCentricLoggingEnabled,
}) {
  const [view, setView] = useState('log')
  const [selectedMachine, setSelectedMachine] = useState(null)
  const [muscleFilter, setMuscleFilter] = useState('All')
  const [reps, setReps] = useState(10)
  const [weight, setWeight] = useState(20)
  const [setType, setSetType] = useState('working')
  const [setTypeByMachine, setSetTypeByMachine] = useState({})
  const [restSeconds, setRestSeconds] = useState(0)
  const [restTimerEnabled, setRestTimerEnabled] = useState(true)
  const [trendTimeframe, setTrendTimeframe] = useState('1w')
  const [setInProgress, setSetInProgress] = useState(false)
  const [activeSetSeconds, setActiveSetSeconds] = useState(0)
  const [logging, setLogging] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const restRef = useRef(null)
  const activeSetRef = useRef(null)
  const setStartTime = useRef(null)
  const setMachineIdRef = useRef(null)
  const lastSetTime = useRef(null)
  const feedbackTimeoutRef = useRef(null)

  useEffect(() => {
    if (setCentricLoggingEnabled) return
    addLog({ level: 'warn', event: 'feature_flags.logset_fallback', message: 'Set-centric controls disabled; using standard log flow.' })
  }, [setCentricLoggingEnabled])

  const showFeedback = useCallback((message, tone = 'success') => {
    setFeedback({ message, tone })
    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current)
    feedbackTimeoutRef.current = setTimeout(() => setFeedback(null), 1600)
  }, [])

  useEffect(() => () => {
    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current)
    if (activeSetRef.current) clearInterval(activeSetRef.current)
  }, [])

  // Rest timer
  useEffect(() => {
    if (sets.length > 0) {
      lastSetTime.current = new Date(sets[sets.length - 1].logged_at).getTime()
    }
    const tick = () => {
      if (lastSetTime.current) {
        setRestSeconds(Math.floor((Date.now() - lastSetTime.current) / 1000))
      }
    }
    restRef.current = setInterval(tick, 1000)
    return () => clearInterval(restRef.current)
  }, [sets.length])

  useEffect(() => {
    if (!setInProgress) return undefined
    const tick = () => {
      if (setStartTime.current) {
        setActiveSetSeconds(Math.max(1, Math.floor((Date.now() - setStartTime.current) / 1000)))
      }
    }
    tick()
    activeSetRef.current = setInterval(tick, 1000)
    return () => {
      if (activeSetRef.current) clearInterval(activeSetRef.current)
    }
  }, [setInProgress])

  const selectMachine = (m) => {
    setSelectedMachine(m)
    const machineSets = sets.filter(s => s.machine_id === m.id)
    if (machineSets.length) {
      const last = machineSets[machineSets.length - 1]
      setReps(last.reps); setWeight(last.weight)
      setSetType(setTypeByMachine[m.id] || last.set_type || 'working')
    } else {
      setReps(m.default_reps || 10); setWeight(m.default_weight || 20)
      setSetType(setTypeByMachine[m.id] || 'working')
    }
    setView('log')
  }

  useEffect(() => {
    if (selectedMachine) {
      onLoadMachineHistory(selectedMachine.id)
    }
  }, [selectedMachine, onLoadMachineHistory])

  const handleLog = async (durationSeconds = null, machineIdOverride = null) => {
    if (logging) return
    const targetMachineId = machineIdOverride || selectedMachine?.id
    if (!targetMachineId) return
    const targetMachine = machines.find((m) => m.id === targetMachineId) || selectedMachine
    setLogging(true)
    const rest = restTimerEnabled && lastSetTime.current
      ? Math.floor((Date.now() - lastSetTime.current) / 1000)
      : null
    try {
      await onLogSet(targetMachineId, reps, weight, durationSeconds, rest, setType)
      setSetTypeByMachine((prev) => ({ ...prev, [targetMachineId]: setType }))
      lastSetTime.current = Date.now()
      setRestSeconds(0)
      if (navigator.vibrate) navigator.vibrate(50)
      const weightLabel = isBodyweightExercise(targetMachine) ? `${weight}kg additional` : `${weight}kg`
      showFeedback(`Logged ${reps} × ${weightLabel} (${setType})`, 'success')
    } catch (error) {
      addLog({ level: 'error', event: 'set.log_failed', message: error?.message || 'Failed to log set.' })
      showFeedback('Could not log set. Please try again.', 'error')
    } finally {
      setLogging(false)
    }
  }

  const handleStartSet = () => {
    if (!selectedMachine || logging || setInProgress) return
    setMachineIdRef.current = selectedMachine.id
    setStartTime.current = Date.now()
    setActiveSetSeconds(0)
    setSetInProgress(true)
  }

  const handleStopSet = async () => {
    if (!setInProgress || !setStartTime.current) return
    const durationSeconds = Math.max(1, Math.floor((Date.now() - setStartTime.current) / 1000))
    const machineId = setMachineIdRef.current || selectedMachine.id
    setSetInProgress(false)
    setStartTime.current = null
    setMachineIdRef.current = null
    setActiveSetSeconds(0)
    await handleLog(durationSeconds, machineId)
  }

  // Select view
  if (view === 'select') {
    const muscleGroups = Array.from(new Set(machines.flatMap(m => m.muscle_groups || []))).sort()
    const filteredMachines = muscleFilter === 'All'
      ? machines
      : machines.filter(m => m.muscle_groups?.includes(muscleFilter))
    return (
      <div style={{ padding: '20px 16px', minHeight: '100dvh' }}>
        <TopBar left={<BackBtn onClick={() => setView('log')} />} title="SELECT EXERCISE" />
        {libraryEnabled && (
          <button onClick={onOpenLibrary} style={{
            width: '100%', padding: 14, borderRadius: 12, border: '1px solid var(--border)',
            background: 'var(--surface2)', color: 'var(--text)', fontSize: 13, fontWeight: 700,
            marginBottom: 16,
          }}>Go to Library</button>
        )}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: 1, marginBottom: 8, fontFamily: 'var(--font-code)' }}>
            FILTER BY MAIN MUSCLE GROUP
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['All', ...muscleGroups].map((group) => {
              const active = muscleFilter === group
              return (
                <button key={group} onClick={() => setMuscleFilter(group)} style={{
                  padding: '6px 12px', borderRadius: 999, border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                  background: active ? 'var(--accent)22' : 'var(--surface2)', color: active ? 'var(--accent)' : 'var(--text-muted)',
                  fontSize: 12, fontWeight: 700,
                }}>{group}</button>
              )
            })}
          </div>
        </div>
        {machines.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏋️</div>
            <div>{libraryEnabled ? 'No exercises yet. Add one from Library.' : 'No exercises available yet.'}</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredMachines.length === 0 && (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-dim)', fontSize: 13 }}>
                No exercises for that muscle group yet.
              </div>
            )}
            {filteredMachines.map(m => <MachineCard key={m.id} machine={m} onSelect={() => selectMachine(m)} />)}
          </div>
        )}
      </div>
    )
  }

  // Main log view
  const setsForMachine = selectedMachine ? sets.filter(s => s.machine_id === selectedMachine.id) : []
  const historyForMachine = selectedMachine ? (machineHistory[selectedMachine.id] || []) : []
  const sessionMetrics = buildMetrics(setsForMachine)
  const trendCutoff = Date.now() - (TREND_TIMEFRAME_OPTIONS.find((option) => option.key === trendTimeframe)?.ms || TREND_TIMEFRAME_OPTIONS[1].ms)
  const trendPoints = historyForMachine
    .map((entry) => ({
      ...entry,
      timestamp: new Date(entry.ended_at || entry.training_date).getTime(),
      metrics: entry.metrics || buildMetrics(entry.sets || []),
    }))
    .filter((entry) => Number.isFinite(entry.timestamp) && entry.timestamp >= trendCutoff)
    .sort((a, b) => a.timestamp - b.timestamp)
  const includeCurrentSession = setsForMachine.length > 0
  const trendValues = [
    ...trendPoints.map((entry) => entry.metrics.totalVolume),
    ...(includeCurrentSession ? [sessionMetrics.totalVolume] : []),
  ]

  return (
    <div style={{ padding: '20px 16px', paddingBottom: 100, minHeight: '100dvh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <BackBtn onClick={onBack} />
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: 'var(--accent)', letterSpacing: 2, fontFamily: 'var(--font-code)' }}>{setCentricLoggingEnabled ? 'SET-FIRST LOGGING' : 'STANDARD LOGGING'}</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{sets.length} sets logged</div>
        </div>
      </div>

      {/* Machine selector button */}
      <button onClick={() => { if (!setInProgress) setView('select') }} disabled={setInProgress} style={{
        width: '100%', padding: 16, borderRadius: 14, cursor: 'pointer', textAlign: 'left', marginBottom: 16,
        border: selectedMachine ? `2px solid ${mc(selectedMachine.muscle_groups?.[0])}44` : '2px dashed var(--text-dim)',
        background: selectedMachine ? 'var(--surface)' : 'var(--surface)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        opacity: setInProgress ? 0.65 : 1,
      }}>
        {selectedMachine ? (
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{selectedMachine.movement}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{selectedMachine.name}</div>
          </div>
        ) : (
          <div style={{ color: 'var(--text-muted)', fontSize: 15 }}>Tap to select an exercise</div>
        )}
        <span style={{ color: 'var(--text-dim)', fontSize: 20 }}>›</span>
      </button>

      {selectedMachine && (
        <>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: 1, marginBottom: 8, fontFamily: 'var(--font-code)' }}>SET TYPE</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {SET_TYPE_OPTIONS.map((type) => {
                const active = setType === type
                return (
                  <button key={type} onClick={() => setSetType(type)} style={{
                    textTransform: 'capitalize',
                    padding: '6px 12px', borderRadius: 999, border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                    background: active ? 'var(--accent)22' : 'var(--surface2)', color: active ? 'var(--accent)' : 'var(--text-muted)',
                    fontSize: 12, fontWeight: 700,
                  }}>{type}</button>
                )
              })}
            </div>
          </div>

          {selectedMachine.notes && (
            <div style={{ background: '#1a1a2e', borderRadius: 12, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#88a', borderLeft: '3px solid #4444ff' }}>
              💡 {selectedMachine.notes}
            </div>
          )}
          {selectedMachine.instruction_image && (
            <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 12, marginBottom: 16, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: 1, marginBottom: 8, fontFamily: 'var(--font-code)' }}>
                INSTRUCTION IMAGE
              </div>
              <img src={selectedMachine.instruction_image} alt="" style={{ width: '100%', borderRadius: 10, objectFit: 'cover', border: '1px solid var(--border)' }} />
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>{selectedMachine.movement}</div>
            </div>
          )}

          {setCentricLoggingEnabled && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: 1, fontFamily: 'var(--font-code)' }}>REST TIMER</div>
            <button onClick={() => setRestTimerEnabled((enabled) => !enabled)} style={{
              border: `1px solid ${restTimerEnabled ? 'var(--accent)' : 'var(--border)'}`,
              background: restTimerEnabled ? 'var(--accent)22' : 'var(--surface2)',
              color: restTimerEnabled ? 'var(--accent)' : 'var(--text-muted)',
              borderRadius: 999,
              padding: '4px 10px',
              fontSize: 12,
              fontWeight: 700,
            }}>{restTimerEnabled ? 'ON' : 'OFF'}</button>
            </div>
          )}

          {/* Rest timer */}
          {setCentricLoggingEnabled && restTimerEnabled && sets.length > 0 && restSeconds > 0 && <RestTimer seconds={restSeconds} />}

          <SliderInput label="Reps" value={reps} onChange={setReps} min={1} max={30} step={1} unit="" color="var(--accent)" />
          <QuickAdjust value={reps} onChange={setReps} step={1} color="var(--accent)" min={1} />
          <SliderInput label={weightLabelForMachine(selectedMachine)} value={weight} onChange={setWeight} min={0} max={200} step={2.5} unit="kg" color="var(--blue)" />
          <QuickAdjust value={weight} onChange={setWeight} step={2.5} color="var(--blue)" />

          {setCentricLoggingEnabled && setInProgress && (
            <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--blue)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
              Set in progress: {fmtTimer(activeSetSeconds)}
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>Exercise selection is locked until you stop this set.</div>
            </div>
          )}

          {setCentricLoggingEnabled && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <button onClick={handleStartSet} disabled={logging || setInProgress} style={{
              width: '100%', padding: 14, borderRadius: 12, fontSize: 14, fontWeight: 800,
              background: 'var(--surface2)', color: setInProgress ? 'var(--text-dim)' : 'var(--accent)',
              border: `1px solid ${setInProgress ? 'var(--border)' : 'var(--accent)66'}`,
              fontFamily: 'var(--font-mono)',
              opacity: logging ? 0.6 : 1,
            }}>START SET</button>
            <button onClick={handleStopSet} disabled={logging || !setInProgress} style={{
              width: '100%', padding: 14, borderRadius: 12, fontSize: 14, fontWeight: 800,
              background: setInProgress ? 'linear-gradient(135deg, var(--blue), #49a9ff)' : 'var(--surface2)',
              color: setInProgress ? '#041018' : 'var(--text-dim)',
              border: '1px solid var(--border)',
              fontFamily: 'var(--font-mono)',
              opacity: logging ? 0.6 : 1,
            }}>STOP & LOG</button>
            </div>
          )}

          <button onClick={() => handleLog()} disabled={logging || (setCentricLoggingEnabled && setInProgress)} style={{
            width: '100%', padding: 20, borderRadius: 14, fontSize: 20, fontWeight: 900,
            background: 'linear-gradient(135deg, var(--accent), var(--accent-dark))', color: '#000',
            fontFamily: 'var(--font-mono)', marginBottom: 24, boxShadow: '0 0 30px var(--accent)33',
            opacity: logging || setInProgress ? 0.6 : 1,
          }}>LOG SET ✓</button>

          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: 2, marginBottom: 10, fontFamily: 'var(--font-code)' }}>
              MACHINE SNAPSHOT
            </div>
            {setsForMachine.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-dim)', background: 'var(--surface)', borderRadius: 12, padding: 12, border: '1px solid var(--border)' }}>
                Log your first set to see live metrics for this machine.
              </div>
            ) : (
              <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 14, border: '1px solid var(--border)' }}>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Volume load trend</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {TREND_TIMEFRAME_OPTIONS.map((option) => {
                        const active = trendTimeframe === option.key
                        return (
                          <button key={option.key} onClick={() => setTrendTimeframe(option.key)} style={{
                            borderRadius: 999,
                            border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                            background: active ? 'var(--accent)22' : 'var(--surface2)',
                            color: active ? 'var(--accent)' : 'var(--text-muted)',
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '3px 8px',
                          }}>{option.label}</button>
                        )
                      })}
                    </div>
                  </div>
                  {trendValues.length ? (
                    <MiniLineChart points={trendValues} color="var(--accent)" height={60} />
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No history in selected timeframe yet.</div>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                  <MetricCard label="Total volume" value={`${fmtNumber(sessionMetrics.totalVolume, 0)} kg`} />
                  <MetricCard label="Total sets" value={fmtNumber(sessionMetrics.totalSets, 0)} />
                  <MetricCard label="Total reps" value={fmtNumber(sessionMetrics.totalReps, 0)} />
                  <MetricCard label="Avg load/rep" value={`${fmtNumber(sessionMetrics.avgLoad, 1)} kg`} />
                  <MetricCard label="Avg reps/set" value={fmtNumber(sessionMetrics.avgRepsPerSet, 1)} />
                  <MetricCard label="Max weight (5-8)" value={`${fmtNumber(sessionMetrics.maxStandardized, 1)} kg`} sub="Fallback: session max" />
                  <MetricCard label="Est. 1RM" value={`${fmtNumber(sessionMetrics.estOneRm, 1)} kg`} sub={sessionMetrics.bestSet ? `${sessionMetrics.bestSet.weight}×${sessionMetrics.bestSet.reps}` : null} />
                  <MetricCard label="Hard sets" value={fmtNumber(sessionMetrics.hardSets, 0)} sub="Proxy: ≤8 reps or ≥90% max" />
                </div>
              </div>
            )}
          </div>

          {setsForMachine.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: 2, marginBottom: 10, fontFamily: 'var(--font-code)' }}>
                SETS ON THIS MACHINE ({setsForMachine.length})
              </div>
              {setsForMachine.map((s, i) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 8, background: 'var(--accent)22', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700,
                    color: 'var(--accent)', fontFamily: 'var(--font-mono)', flexShrink: 0,
                  }}>{i + 1}</div>
                  <div style={{ flex: 1, fontSize: 16, fontFamily: 'var(--font-mono)', color: '#ccc' }}>
                    <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{s.reps}</span>
                    <span style={{ color: 'var(--text-dim)' }}> × </span>
                    <span style={{ color: 'var(--blue)', fontWeight: 700 }}>{s.weight}</span>
                    <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                      {isBodyweightExercise(selectedMachine) ? 'kg additional' : 'kg'}
                    </span>
                  </div>
                  {s.rest_seconds && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{fmtTimer(s.rest_seconds)} rest</span>}
                  <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{fmtTime(s.logged_at)}</span>
                  <button onClick={() => onDeleteSet(s.id)} style={{ color: 'var(--red)44', fontSize: 16, padding: 4 }}>×</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Full session log */}
      {sets.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: 2, marginBottom: 10, fontFamily: 'var(--font-code)' }}>
            ALL SETS ({sets.length})
          </div>
          {[...sets].reverse().map(s => {
            const m = machines.find(ma => ma.id === s.machine_id)
            return (
              <div key={s.id} style={{
                background: 'var(--surface)', borderRadius: 12, padding: '10px 14px', marginBottom: 6,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                borderLeft: `3px solid ${mc(m?.muscle_groups?.[0])}`,
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#ccc' }}>{m?.movement || 'Unknown'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{fmtTime(s.logged_at)}</div>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)' }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent)' }}>{s.reps}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-dim)' }}> × </span>
                  <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--blue)' }}>{s.weight}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{isBodyweightExercise(m) ? 'kg additional' : 'kg'}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {feedback && (
        <div style={{
          position: 'fixed',
          left: '50%',
          bottom: 22,
          transform: 'translateX(-50%)',
          padding: '10px 14px',
          borderRadius: 10,
          border: `1px solid ${feedback.tone === 'error' ? 'var(--red)88' : 'var(--accent)66'}`,
          background: feedback.tone === 'error' ? 'rgba(40, 10, 10, 0.95)' : 'rgba(15, 30, 20, 0.95)',
          color: feedback.tone === 'error' ? 'var(--red)' : 'var(--accent)',
          fontSize: 12,
          fontWeight: 700,
          fontFamily: 'var(--font-mono)',
          letterSpacing: 0.3,
          boxShadow: '0 6px 24px rgba(0,0,0,0.4)',
          zIndex: 30,
        }}>
          {feedback.message}
        </div>
      )}

    </div>
  )
}

// ─── History Screen ────────────────────────────────────────

function HistoryScreen({ trainingBuckets, machines, onBack }) {
  return (
    <div style={{ padding: '20px 16px', minHeight: '100dvh' }}>
      <TopBar left={<BackBtn onClick={onBack} />} title="HISTORY" />
      {trainingBuckets.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 16 }}>No sets logged yet</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {trainingBuckets.slice().reverse().map((bucket) => {
            const durationMs = new Date(bucket.ended_at) - new Date(bucket.started_at)
            const setCount = bucket.sets.length
            const uniqueMovements = [...new Set(bucket.sets.map((set) => set.machine_name))]
            return (
              <div key={bucket.training_bucket_id} style={{
                background: 'var(--surface)', borderRadius: 14, padding: 16, border: '1px solid var(--border)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{fmtFull(bucket.started_at)}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{fmtDur(durationMs)}</div>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
                  {setCount} sets · {uniqueMovements.length} exercises
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {uniqueMovements.map((movement) => {
                    const machine = machines.find((m) => m.movement === movement)
                    return <Pill key={movement} text={movement} color={mc(machine?.muscle_groups?.[0])} />
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Analysis Screen ───────────────────────────────────────

function AnalysisScreen({
  machines,
  machineHistory,
  onLoadMachineHistory,
  onBack,
  initialTab = 'run',
  analysisOnDemandOnly,
  trainingBuckets,
  sorenessHistory,
}) {
  const [selectedMachineId, setSelectedMachineId] = useState(machines[0]?.id || '')
  const [setTypeMode, setSetTypeMode] = useState('working')
  const [customSetTypes, setCustomSetTypes] = useState(['working'])
  const [scopeMode, setScopeMode] = useState('30d')
  const [customScopeStart, setCustomScopeStart] = useState('')
  const [customScopeEnd, setCustomScopeEnd] = useState('')
  const [selectedGoals, setSelectedGoals] = useState(['strength'])
  const [goalsNotes, setGoalsNotes] = useState('')
  const [recommendationSetTypeMode, setRecommendationSetTypeMode] = useState('working')
  const [customRecommendationSetTypes, setCustomRecommendationSetTypes] = useState(['working'])
  const [recommendationState, setRecommendationState] = useState({ loading: false, error: '', data: null })
  const [savedReports, setSavedReports] = useState([])
  const [selectedReport, setSelectedReport] = useState(null)
  const [reportLoadError, setReportLoadError] = useState('')
  const [reportTypeFilter, setReportTypeFilter] = useState('all')
  const [reportStatusFilter, setReportStatusFilter] = useState('all')
  const [reportDateFilter, setReportDateFilter] = useState('all')
  const [reportCustomStart, setReportCustomStart] = useState('')
  const [reportCustomEnd, setReportCustomEnd] = useState('')
  const [reportSearch, setReportSearch] = useState('')
  const [weeklyTrends, setWeeklyTrends] = useState([])
  const [activeTab, setActiveTab] = useState(initialTab)

  useEffect(() => {
    setActiveTab(initialTab || 'run')
  }, [initialTab])

  useEffect(() => {
    if (!selectedMachineId && machines.length) {
      setSelectedMachineId(machines[0].id)
    }
  }, [machines, selectedMachineId])

  const latestTrainingDate = useMemo(() => {
    const datedBuckets = trainingBuckets.filter((bucket) => bucket.training_date)
    if (!datedBuckets.length) return ''
    return datedBuckets.reduce((latest, bucket) => (bucket.training_date > latest ? bucket.training_date : latest), datedBuckets[0].training_date)
  }, [trainingBuckets])

  const today = new Date()
  const todayIso = today.toISOString().slice(0, 10)
  const last30Start = new Date(today.getTime() - 29 * 86400000).toISOString().slice(0, 10)

  const scopeDateStart = scopeMode === 'last_training_day'
    ? (latestTrainingDate || todayIso)
    : scopeMode === 'custom'
      ? (customScopeStart || customScopeEnd || last30Start)
      : last30Start

  const scopeDateEnd = scopeMode === 'last_training_day'
    ? (latestTrainingDate || todayIso)
    : scopeMode === 'custom'
      ? (customScopeEnd || customScopeStart || todayIso)
      : todayIso

  const reportDateStart = reportDateFilter === '30d'
    ? new Date(today.getTime() - 29 * 86400000).toISOString().slice(0, 10)
    : reportDateFilter === '90d'
      ? new Date(today.getTime() - 89 * 86400000).toISOString().slice(0, 10)
      : reportDateFilter === 'custom'
        ? (reportCustomStart || reportCustomEnd || null)
        : null

  const reportDateEnd = reportDateFilter === 'all'
    ? null
    : reportDateFilter === 'custom'
      ? (reportCustomEnd || reportCustomStart || null)
      : todayIso

  const recommendationSetTypePool = useMemo(() => {
    if (recommendationSetTypeMode === 'all') return [...SET_TYPE_OPTIONS]
    if (recommendationSetTypeMode === 'working') return ['working']
    return customRecommendationSetTypes.length ? customRecommendationSetTypes : ['working']
  }, [recommendationSetTypeMode, customRecommendationSetTypes])

  useEffect(() => {
    let active = true
    const loadReports = async () => {
      try {
        const reportType = reportTypeFilter === 'all' ? null : reportTypeFilter
        const status = reportStatusFilter === 'all' ? null : reportStatusFilter
        const reports = await getAnalysisReports(reportType, {
          status,
          search: reportSearch,
          dateStart: reportDateStart,
          dateEnd: reportDateEnd,
          limit: 100,
        })
        const trendReports = await getAnalysisReports('weekly_trend', { limit: 8 })
        if (!active) return
        setSavedReports(reports)
        setWeeklyTrends(trendReports)
        if (
          selectedReport?.id
          && !reports.some((report) => report.id === selectedReport.id)
          && !trendReports.some((report) => report.id === selectedReport.id)
        ) {
          setSelectedReport(null)
        }
        setReportLoadError('')
      } catch (error) {
        if (!active) return
        setReportLoadError(error?.message || 'Could not load saved reports.')
      }
    }
    loadReports()
    return () => { active = false }
  }, [recommendationState.data, reportTypeFilter, reportStatusFilter, reportSearch, reportDateStart, reportDateEnd])

  const historyEntries = selectedMachineId ? (machineHistory[selectedMachineId] || []) : []
  const includedSetTypes = setTypeMode === 'all'
    ? SET_TYPE_OPTIONS
    : setTypeMode === 'working'
      ? ['working']
      : customSetTypes

  const history = historyEntries
    .map((entry) => {
      const filteredSets = filterSetsByType(entry.sets, includedSetTypes)
      return {
        ...entry,
        metrics: buildMetrics(filteredSets),
      }
    })
    .filter((entry) => entry.metrics.totalSets > 0)

  const recommendationGroupedTraining = useMemo(() => {
    return trainingBuckets
      .map((bucket) => {
        const bucketDate = bucket.training_date || bucket.started_at?.slice(0, 10)
        if (!bucketDate || bucketDate < scopeDateStart || bucketDate > scopeDateEnd) return null
        const filteredSets = (bucket.sets || []).filter((set) => recommendationSetTypePool.includes(set.set_type || 'working'))
        if (!filteredSets.length) return null
        return {
          ...bucket,
          sets: filteredSets,
        }
      })
      .filter(Boolean)
  }, [trainingBuckets, recommendationSetTypePool, scopeDateStart, scopeDateEnd])

  const sorenessDataForScope = useMemo(() => {
    return (sorenessHistory || []).filter((entry) => {
      const date = (entry.reported_at || '').slice(0, 10)
      return date && date >= scopeDateStart && date <= scopeDateEnd
    })
  }, [sorenessHistory, scopeDateStart, scopeDateEnd])

  const equipmentById = useMemo(() => {
    return machines.reduce((acc, machine) => {
      acc[machine.id] = {
        name: machine.name,
        movement: machine.movement,
        muscle_groups: machine.muscle_groups || [],
        equipment_type: machine.equipment_type || 'other',
      }
      return acc
    }, {})
  }, [machines])

  const toggleGoal = (goal) => {
    setSelectedGoals((prev) => {
      if (prev.includes(goal)) return prev.filter((value) => value !== goal)
      return [...prev, goal]
    })
  }

  const toggleCustomRecommendationSetType = (type) => {
    setCustomRecommendationSetTypes((prev) => {
      if (prev.includes(type)) return prev.filter((value) => value !== type)
      return [...prev, type]
    })
  }

  const loadReportDetail = async (reportId) => {
    try {
      const fullReport = await getAnalysisReport(reportId)
      setSelectedReport(fullReport)
    } catch (error) {
      setReportLoadError(error?.message || 'Failed to load report details.')
    }
  }

  const handleRunRecommendations = async () => {
    if (!recommendationGroupedTraining.length) {
      setRecommendationState({ loading: false, error: 'No scoped training data found for this scope and set-type selection.', data: null })
      return
    }

    const normalizedGoals = [...new Set(selectedGoals.map((goal) => String(goal || '').trim()).filter(Boolean))]
    const normalizedGoalNotes = goalsNotes.trim() || null

    const scope = {
      grouping: 'training_day',
      date_start: scopeDateStart,
      date_end: scopeDateEnd,
      included_set_types: recommendationSetTypePool,
      goals: normalizedGoals,
      recommendations: normalizedGoalNotes,
    }

    setRecommendationState({ loading: true, error: '', data: null })
    try {
      const response = await getRecommendations(scope, recommendationGroupedTraining, equipmentById, sorenessDataForScope)
      setRecommendationState({ loading: false, error: '', data: response })
      if (response?.report_id) {
        await loadReportDetail(response.report_id)
      }
    } catch (error) {
      setRecommendationState({ loading: false, error: error?.message || 'Failed to generate analysis.', data: null })
    }
  }

  const recs = recommendationState.data
  const selectedReportPayload = selectedReport?.payload || null
  const selectedEvidence = selectedReport?.evidence || selectedReportPayload?.evidence || []
  const trendReports = weeklyTrends
  const latestTrend = trendReports[0] || null
  const previousTrends = trendReports.slice(1, 4)
  const formatTrendPeriod = (report) => {
    const min = report?.metadata?.week_start_min
    const max = report?.metadata?.week_start_max
    if (!min || !max) return ''
    if (min === max) return `Period covered: week of ${min}`
    return `Period covered: ${min} → ${max}`
  }

  const metricConfigs = [
    { key: 'totalVolume', label: 'Total volume load (kg)', color: 'var(--accent)', format: (v) => `${fmtNumber(v, 0)} kg` },
    { key: 'totalSets', label: 'Total sets', color: 'var(--blue)', format: (v) => fmtNumber(v, 0) },
    { key: 'totalReps', label: 'Total reps', color: '#ffe66d', format: (v) => fmtNumber(v, 0) },
    { key: 'avgLoad', label: 'Average load per rep', color: '#4ecdc4', format: (v) => `${fmtNumber(v, 1)} kg` },
    { key: 'avgRepsPerSet', label: 'Average reps per set', color: '#ff8a5c', format: (v) => fmtNumber(v, 1) },
    { key: 'maxStandardized', label: 'Max weight (5–8 reps)', color: '#c9b1ff', format: (v) => `${fmtNumber(v, 1)} kg` },
    { key: 'estOneRm', label: 'Estimated 1RM (best set)', color: '#88d8b0', format: (v) => `${fmtNumber(v, 1)} kg` },
    { key: 'hardSets', label: 'Hard sets proxy', color: '#ff6b6b', format: (v) => fmtNumber(v, 0) },
    { key: 'avgTimedDuration', label: 'Average timed set duration', color: '#f7b267', format: (v) => v === null ? 'Unknown' : `${fmtNumber(v, 1)} s` },
  ]

  return (
    <div style={{ padding: '20px 16px', minHeight: '100dvh' }}>
      <TopBar left={<BackBtn onClick={onBack} />} title="ANALYZE" />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {[
          { key: 'run', label: 'Run Analysis' },
          { key: 'reports', label: 'Reports' },
          { key: 'trends', label: 'Trends' },
          { key: 'metrics', label: 'Exercise Metrics' },
        ].map((tab) => {
          const isActive = activeTab === tab.key
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
              padding: '8px 12px',
              borderRadius: 999,
              border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
              background: isActive ? 'var(--accent)22' : 'var(--surface)',
              color: isActive ? 'var(--accent)' : 'var(--text-muted)',
              fontSize: 12,
              fontWeight: 700,
            }}>{tab.label}</button>
          )
        })}
      </div>

      {activeTab === 'run' && (
      <>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', marginBottom: 2 }}>Run Analysis</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Set scope, goals, and set-type policy, then generate a focused AI recommendation report.</div>
      </div>

      <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: 14, marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', letterSpacing: 1, fontFamily: 'var(--font-code)', marginBottom: 10 }}>ANALYZE MENU</div>

        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6, fontFamily: 'var(--font-code)' }}>SCOPE</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            {[
              { key: 'last_training_day', label: 'Last training day' },
              { key: '30d', label: 'Last 30 days' },
              { key: 'custom', label: 'Custom' },
            ].map((option) => {
              const active = scopeMode === option.key
              return (
                <button key={option.key} onClick={() => setScopeMode(option.key)} style={{
                  padding: '6px 12px', borderRadius: 999, border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                  background: active ? 'var(--accent)22' : 'var(--surface2)', color: active ? 'var(--accent)' : 'var(--text-muted)',
                  fontSize: 12, fontWeight: 700,
                }}>{option.label}</button>
              )
            })}
          </div>

          {scopeMode === 'custom' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input type="date" value={customScopeStart} onChange={(e) => setCustomScopeStart(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)' }} />
              <input type="date" value={customScopeEnd} onChange={(e) => setCustomScopeEnd(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)' }} />
            </div>
          )}
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>{scopeDateStart} → {scopeDateEnd}</div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6, fontFamily: 'var(--font-code)' }}>GOALS</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            {['strength', 'volume balance', 'recovery', 'consistency'].map((goal) => {
              const active = selectedGoals.includes(goal)
              return (
                <button key={goal} onClick={() => toggleGoal(goal)} style={{
                  textTransform: 'capitalize',
                  padding: '6px 12px', borderRadius: 999, border: `1px solid ${active ? 'var(--blue)' : 'var(--border)'}`,
                  background: active ? 'var(--blue)22' : 'var(--surface2)', color: active ? 'var(--blue)' : 'var(--text-muted)',
                  fontSize: 12, fontWeight: 700,
                }}>{goal}</button>
              )
            })}
          </div>
          <textarea
            value={goalsNotes}
            onChange={(e) => setGoalsNotes(e.target.value)}
            placeholder="Optional note for the AI (constraints, soreness context, focus areas)."
            rows={3}
            style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid var(--border)', resize: 'vertical', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13 }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6, fontFamily: 'var(--font-code)' }}>SET-TYPE INCLUSION POLICY</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            {[
              { key: 'all', label: 'Include all' },
              { key: 'working', label: 'Working only' },
              { key: 'custom', label: 'Custom' },
            ].map((mode) => {
              const active = recommendationSetTypeMode === mode.key
              return (
                <button key={mode.key} onClick={() => setRecommendationSetTypeMode(mode.key)} style={{
                  padding: '6px 12px', borderRadius: 999, border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                  background: active ? 'var(--accent)22' : 'var(--surface2)', color: active ? 'var(--accent)' : 'var(--text-muted)',
                  fontSize: 12, fontWeight: 700,
                }}>{mode.label}</button>
              )
            })}
          </div>
          {recommendationSetTypeMode === 'custom' && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {SET_TYPE_OPTIONS.map((type) => {
                const active = customRecommendationSetTypes.includes(type)
                return (
                  <button key={type} onClick={() => toggleCustomRecommendationSetType(type)} style={{
                    textTransform: 'capitalize',
                    padding: '6px 12px', borderRadius: 999, border: `1px solid ${active ? 'var(--blue)' : 'var(--border)'}`,
                    background: active ? 'var(--blue)22' : 'var(--surface2)', color: active ? 'var(--blue)' : 'var(--text-muted)',
                    fontSize: 12, fontWeight: 700,
                  }}>{type}</button>
                )
              })}
            </div>
          )}
        </div>

        <button onClick={handleRunRecommendations} disabled={recommendationState.loading} style={{
          width: '100%', padding: 12, borderRadius: 10, border: '1px solid var(--border)',
          background: recommendationState.loading ? 'var(--surface2)' : 'linear-gradient(135deg, var(--accent), var(--accent-dark))',
          color: recommendationState.loading ? 'var(--text-muted)' : '#000', fontWeight: 800, fontFamily: 'var(--font-mono)',
        }}>
          {recommendationState.loading ? 'Generating analysis…' : 'Run analysis'}
        </button>

        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-dim)' }}>
          Using {recommendationGroupedTraining.length} training buckets, {sorenessDataForScope.length} soreness reports.
        </div>

        {recommendationState.error && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--red)' }}>{recommendationState.error}</div>
        )}
      </div>

      {recs && (
        <div style={{ background: '#10131c', border: '1px solid #2a2f3a', borderRadius: 14, padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8, letterSpacing: 1, fontFamily: 'var(--font-code)' }}>LATEST RESPONSE</div>
          {recs.report_persisted === false && (
            <div style={{ fontSize: 12, color: '#f7b267', marginBottom: 8 }}>
              Generated successfully but couldn&apos;t save to Reports.
            </div>
          )}
          {recs.summary && <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.5, marginBottom: 10 }}>{recs.summary}</div>}
          {recs.highlights?.length > 0 && recs.highlights.map((item, idx) => <div key={`h-${idx}`} style={{ fontSize: 13, color: '#cde8ff', marginBottom: 4 }}>• {item}</div>)}
        </div>
      )}
      </>
      )}

      {activeTab === 'reports' && (
      <>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', marginBottom: 2 }}>Reports</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Filter saved analyses, inspect detail, and quickly recover prior recommendations or evidence.</div>
      </div>

      <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: 14, marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: 1, fontFamily: 'var(--font-code)', marginBottom: 10 }}>REPORTS</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <select value={reportTypeFilter} onChange={(e) => setReportTypeFilter(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13 }}>
            <option value="all">All report types</option>
            <option value="recommendation">Recommendations</option>
            <option value="weekly_trend">Weekly trends</option>
          </select>
          <select value={reportStatusFilter} onChange={(e) => setReportStatusFilter(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13 }}>
            <option value="all">All statuses</option>
            <option value="ready">Ready</option>
            <option value="failed">Failed</option>
          </select>
        </div>
        <div style={{ marginBottom: 8 }}>
          <select value={reportDateFilter} onChange={(e) => setReportDateFilter(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13 }}>
            <option value="all">Any time</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="custom">Custom range</option>
          </select>
        </div>
        {reportDateFilter === 'custom' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <input type="date" value={reportCustomStart} onChange={(e) => setReportCustomStart(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)' }} />
            <input type="date" value={reportCustomEnd} onChange={(e) => setReportCustomEnd(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)' }} />
          </div>
        )}
        <input
          value={reportSearch}
          onChange={(e) => setReportSearch(e.target.value)}
          placeholder="Search report title or summary"
          style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13, marginBottom: 10 }}
        />

        {reportLoadError && <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 8 }}>{reportLoadError}</div>}
        {!savedReports.length ? (
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No reports found for the selected filters.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {savedReports.slice(0, 10).map((report) => (
              <button key={report.id} onClick={() => loadReportDetail(report.id)} style={{
                textAlign: 'left', padding: 10, borderRadius: 10, border: '1px solid var(--border)',
                background: selectedReport?.id === report.id ? 'var(--surface2)' : 'transparent', color: 'var(--text)',
              }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{report.title || 'Analysis report'}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{report.report_type} · {new Date(report.created_at).toLocaleString()}</div>
                {report.summary && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>{report.summary}</div>}
              </button>
            ))}
          </div>
        )}

        {selectedReportPayload && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, letterSpacing: 1, fontFamily: 'var(--font-code)' }}>REPORT DETAIL</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>{selectedReport?.title || 'Analysis report'}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{selectedReportPayload.summary || selectedReport.summary || 'No summary available.'}</div>
            {selectedReportPayload.highlights?.length > 0 && selectedReportPayload.highlights.map((item, idx) => (
              <div key={`saved-highlight-${idx}`} style={{ fontSize: 12, color: 'var(--text)', marginBottom: 4 }}>• {item}</div>
            ))}

            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6, letterSpacing: 1, fontFamily: 'var(--font-code)' }}>WHY (EVIDENCE)</div>
              {selectedEvidence?.length ? selectedEvidence.map((item, idx) => (
                <details key={`saved-evidence-${idx}`} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px', marginBottom: 8, background: 'var(--surface2)' }}>
                  <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--text)', fontWeight: 700 }}>{item.claim || 'Evidence claim'}</summary>
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                    <div>Metric: {item.metric || 'n/a'}</div>
                    <div>Period: {item.period || 'n/a'}</div>
                    <div>Delta: {item.delta ?? 'n/a'}</div>
                    <div>Source: {item?.source?.grouping || 'n/a'} · Set types: {(item?.source?.included_set_types || []).join(', ') || 'n/a'} · Samples: {item?.source?.sample_size ?? 'n/a'}</div>
                  </div>
                </details>
              )) : <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No evidence details available.</div>}
            </div>
          </div>
        )}
      </div>
      </>
      )}

      {activeTab === 'trends' && (
      <>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', marginBottom: 2 }}>Trends</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Compare the latest weekly trend report with prior weeks to spot momentum shifts early.</div>
      </div>

      <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: 14, marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: 1, fontFamily: 'var(--font-code)', marginBottom: 10 }}>WEEKLY TRENDS</div>
        {!latestTrend ? (
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No weekly trend reports yet.</div>
        ) : (
          <>
            <button onClick={() => loadReportDetail(latestTrend.id)} style={{ width: '100%', textAlign: 'left', border: '1px solid var(--border)', borderRadius: 10, padding: 10, marginBottom: 8, background: 'var(--surface2)', color: 'var(--text)' }}>
              <div style={{ fontSize: 12, fontWeight: 700 }}>Latest: {latestTrend.title || 'Weekly trends'}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(latestTrend.created_at).toLocaleString()}</div>
              {formatTrendPeriod(latestTrend) && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{formatTrendPeriod(latestTrend)}</div>}
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{latestTrend.summary || 'No summary available.'}</div>
            </button>
            {previousTrends.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {previousTrends.map((trendReport) => (
                  <button key={trendReport.id} onClick={() => loadReportDetail(trendReport.id)} style={{ width: '100%', textAlign: 'left', border: '1px solid var(--border)', borderRadius: 10, padding: 10, background: 'transparent', color: 'var(--text)' }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{trendReport.title || 'Weekly trends'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(trendReport.created_at).toLocaleString()}</div>
                    {formatTrendPeriod(trendReport) && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{formatTrendPeriod(trendReport)}</div>}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      </>
      )}

      {activeTab === 'metrics' && (
      <>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', marginBottom: 2 }}>Exercise Metrics</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Pick one exercise to review local trend metrics and set-type filtered progression at a glance.</div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: 1, fontFamily: 'var(--font-code)', marginBottom: 6 }}>EXERCISE</div>
        <select value={selectedMachineId} onChange={(e) => setSelectedMachineId(e.target.value)} style={{
          width: '100%', padding: 12, borderRadius: 10, border: '1px solid var(--border)',
          background: 'var(--surface)', color: 'var(--text)', fontSize: 14,
        }}>
          {machines.map((m) => (
            <option key={m.id} value={m.id}>{m.movement}</option>
          ))}
        </select>
      </div>

      {analysisOnDemandOnly && (
        <button onClick={() => {
          if (!selectedMachineId) {
            addLog({ level: 'warn', event: 'analysis.load_fallback', message: 'Machine selection required before loading analysis.' })
            return
          }
          onLoadMachineHistory(selectedMachineId)
        }} style={{
          width: '100%',
          marginBottom: 14,
          padding: 12,
          borderRadius: 10,
          border: '1px solid var(--border)',
          background: 'var(--surface2)',
          color: 'var(--text)',
          fontWeight: 700,
        }}>Load exercise analysis</button>
      )}

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: 1, marginBottom: 8, fontFamily: 'var(--font-code)' }}>SET TYPE FILTER</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          {[
            { key: 'all', label: 'Include all' },
            { key: 'working', label: 'Working only' },
            { key: 'custom', label: 'Custom' },
          ].map((mode) => {
            const active = setTypeMode === mode.key
            return (
              <button key={mode.key} onClick={() => setSetTypeMode(mode.key)} style={{
                padding: '6px 12px', borderRadius: 999, border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                background: active ? 'var(--accent)22' : 'var(--surface2)', color: active ? 'var(--accent)' : 'var(--text-muted)',
                fontSize: 12, fontWeight: 700,
              }}>{mode.label}</button>
            )
          })}
        </div>
        {setTypeMode === 'custom' && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {SET_TYPE_OPTIONS.map((type) => {
              const active = customSetTypes.includes(type)
              return (
                <button key={type} onClick={() => {
                  setCustomSetTypes((prev) => {
                    if (prev.includes(type)) return prev.filter((value) => value !== type)
                    return [...prev, type]
                  })
                }} style={{
                  textTransform: 'capitalize',
                  padding: '6px 12px', borderRadius: 999, border: `1px solid ${active ? 'var(--blue)' : 'var(--border)'}`,
                  background: active ? 'var(--blue)22' : 'var(--surface2)', color: active ? 'var(--blue)' : 'var(--text-muted)',
                  fontSize: 12, fontWeight: 700,
                }}>{type}</button>
              )
            })}
          </div>
        )}
      </div>

      <div title="Duration metrics exclude sets where duration was not timed." style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16 }}>
        ⓘ Duration unknown if not timed.
      </div>
      {history.length === 0 ? (
        <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 16, border: '1px solid var(--border)', color: 'var(--text-dim)' }}>
          No logged sets for this exercise with the selected filter.
        </div>
      ) : (
        <>
          {metricConfigs.map((metric) => {
            const values = history.map(h => h.metrics[metric.key] ?? 0)
            const lastEntry = history[history.length - 1]
            const lastValue = lastEntry?.metrics[metric.key] ?? 0
            const previousValue = history.length > 1 ? history[history.length - 2].metrics[metric.key] : null
            const delta = previousValue !== null ? lastValue - previousValue : null
            return (
              <div key={metric.key} style={{ background: 'var(--surface)', borderRadius: 14, padding: 14, border: '1px solid var(--border)', marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{metric.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Latest: {metric.format(lastValue)}
                    {delta !== null && (
                      <span style={{ marginLeft: 8, color: delta >= 0 ? 'var(--accent)' : 'var(--red)' }}>
                        {delta >= 0 ? '+' : ''}{metric.format(delta)}
                      </span>
                    )}
                  </div>
                </div>
                <MiniBarChart values={values} color={metric.color} height={70} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: 'var(--text-dim)' }}>
                  <span>{fmt(history[0].started_at)}</span>
                  <span>{fmt(history[history.length - 1].started_at)}</span>
                </div>
              </div>
            )
          })}
        </>
      )}
      </>
      )}
    </div>
  )
}

// ─── Diagnostics Screen ────────────────────────────────────

function DiagnosticsScreen({ user, onBack }) {
  const [logs, setLogs] = useState([])
  const [healthStatus, setHealthStatus] = useState(null)
  const [authInfo, setAuthInfo] = useState({ state: 'loading', session: null, error: null })
  const [copyStatus, setCopyStatus] = useState(null)
  const [copyFallback, setCopyFallback] = useState('')
  const [levelFilter, setLevelFilter] = useState('all')
  const [eventFilter, setEventFilter] = useState('')

  useEffect(() => {
    const unsubscribe = subscribeLogs(setLogs)
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    let active = true
    const loadSession = async () => {
      try {
        const session = await getSession()
        if (!active) return
        setAuthInfo({ state: session ? 'authenticated' : 'anonymous', session, error: null })
      } catch (error) {
        if (!active) return
        addLog({ level: 'error', event: 'auth.session_error', message: error?.message || 'Failed to load session.' })
        setAuthInfo({ state: 'error', session: null, error })
      }
    }
    loadSession()
    return () => { active = false }
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

  const filteredLogs = useMemo(() => {
    const normalizedEvent = eventFilter.trim().toLowerCase()
    return logs.filter((entry) => {
      const levelOk = levelFilter === 'all' || entry.level === levelFilter
      const eventOk = !normalizedEvent || entry.event.toLowerCase().includes(normalizedEvent)
      return levelOk && eventOk
    })
  }, [logs, levelFilter, eventFilter])
  const recentLogs = filteredLogs.slice(-20).reverse()
  const session = authInfo.session
  const expiresAt = session?.expires_at ? new Date(session.expires_at * 1000).toLocaleString() : 'n/a'

  return (
    <div style={{ padding: '20px 16px', minHeight: '100dvh' }}>
      <TopBar left={<BackBtn onClick={onBack} />} title="DIAGNOSTICS" />

      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 16, border: '1px solid var(--border)', marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: 1, fontFamily: 'var(--font-code)', marginBottom: 6 }}>API BASE URL</div>
        <div style={{ fontSize: 14, color: 'var(--text)', wordBreak: 'break-all' }}>{API_BASE_URL}</div>
      </div>

      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 16, border: '1px solid var(--border)', marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: 1, fontFamily: 'var(--font-code)', marginBottom: 6 }}>AUTH STATE</div>
        <div style={{ fontSize: 14, color: 'var(--text)' }}>
          {authInfo.state === 'loading' && 'Checking session...'}
          {authInfo.state === 'error' && `Error: ${authInfo.error?.message || 'Unknown'}`}
          {authInfo.state !== 'loading' && authInfo.state !== 'error' && (
            <>
              <div>Status: {authInfo.state}</div>
              <div>User ID: {user?.id || 'n/a'}</div>
              <div>Session expires: {expiresAt}</div>
            </>
          )}
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

// ─── Main App ──────────────────────────────────────────────

export default function App() {
  const [user, setUser] = useState(undefined) // undefined=loading, null=logged out
  const [screen, setScreen] = useState('home')
  const [analysisInitialTab, setAnalysisInitialTab] = useState('run')
  const [machines, setMachines] = useState([])
  const [sets, setSets] = useState([])
  const [pendingSoreness, setPendingSoreness] = useState([])
  const [sorenessHistory, setSorenessHistory] = useState([])
  const [machineHistory, setMachineHistory] = useState({})
  const [machineHistoryStatus, setMachineHistoryStatus] = useState({})
  const [featureFlags, setFeatureFlags] = useState(DEFAULT_FLAGS)
  const [featureFlagsLoading, setFeatureFlagsLoading] = useState(true)

  // Auth listener
  useEffect(() => {
    let active = true
    const loadUser = async () => {
      const { data, error } = await supabase.auth.getUser()
      if (!active) return
      if (error) {
        addLog({ level: 'error', event: 'auth.get_user_failed', message: error.message })
        setUser(null)
        return
      }
      setUser(data?.user || null)
    }
    loadUser()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null)
    })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (user === undefined) return
    let active = true

    const loadFlags = async () => {
      setFeatureFlagsLoading(true)
      try {
        const resolvedFlags = await getFeatureFlags()
        if (!active) return
        setFeatureFlags(resolvedFlags)
      } catch (error) {
        if (!active) return
        addLog({ level: 'warn', event: 'feature_flags.load_failed', message: error?.message || 'Falling back to default feature flags.' })
        setFeatureFlags(DEFAULT_FLAGS)
      } finally {
        if (active) setFeatureFlagsLoading(false)
      }
    }

    loadFlags()
    return () => {
      active = false
    }
  }, [user])

  const loadData = useCallback(async () => {
    if (!user) return
    try {
      try {
        await bootstrapDefaultEquipmentCatalog()
      } catch (seedError) {
        addLog({ level: 'warn', event: 'catalog.seed_failed', message: seedError?.message || 'Default catalog seed failed.' })
      }

      const [m, allSets, recentSoreness] = await Promise.all([getMachines(), getSets(), getRecentSoreness()])
      setMachines(m)
      setSets(allSets)
      setSorenessHistory(recentSoreness || [])

      const pending = await getPendingSoreness()
      const enriched = pending.map((p) => ({ ...p, _sets: p._sets || [] }))
      setPendingSoreness(enriched)
    } catch (e) {
      addLog({ level: 'error', event: 'data.load_failed', message: e?.message || 'Failed to load data.' })
      console.error('Load error:', e)
    }
  }, [user])

  useEffect(() => { if (user) loadData() }, [user, loadData])

  useEffect(() => {
    setMachineHistory({})
    setMachineHistoryStatus({})
  }, [sets.length])

  // ─── Actions ─────────────────────────────────────────────
  const handleLogSet = async (machineId, reps, weight, duration, rest, setType = 'working') => {
    const s = await dbLogSet(null, machineId, reps, weight, duration, rest, setType)
    setSets(prev => [...prev, s])
  }

  const handleDeleteSet = async (id) => {
    await dbDeleteSet(id)
    setSets(prev => prev.filter(s => s.id !== id))
  }

  const handleSaveMachine = async (machineData) => {
    const saved = await upsertMachine(machineData)
    setMachines(prev => {
      const exists = prev.find(m => m.id === saved.id)
      return exists ? prev.map(m => m.id === saved.id ? saved : m) : [saved, ...prev]
    })
    return saved
  }

  const handleDeleteMachine = async (id) => {
    await dbDeleteMachine(id)
    setMachines(prev => prev.filter(m => m.id !== id))
  }

  const handleSorenessSubmit = async (trainingBucketId, reports) => {
    await submitSoreness(trainingBucketId, reports)
    setPendingSoreness(prev => prev.filter((s) => s.training_bucket_id !== trainingBucketId))
  }

  const handleSorenessDismiss = (trainingBucketId) => {
    setPendingSoreness(prev => prev.filter((s) => s.training_bucket_id !== trainingBucketId))
  }

  const loadMachineHistory = useCallback(async (machineId) => {
    if (!machineId) return
    if (machineHistory[machineId] || machineHistoryStatus[machineId] === 'loading') return
    setMachineHistoryStatus(prev => ({ ...prev, [machineId]: 'loading' }))
    try {
      const buckets = buildTrainingBuckets(sets, machines)
      const entries = buckets
        .map((bucket) => {
          const machineSets = bucket.sets.filter((set) => set.machine_id === machineId)
          if (!machineSets.length) return null
          return {
            training_bucket_id: bucket.training_bucket_id,
            workout_cluster_id: bucket.workout_cluster_id,
            workout_cluster_ids: bucket.workout_cluster_ids || [],
            training_date: bucket.training_date,
            started_at: bucket.started_at,
            ended_at: bucket.ended_at,
            sets: machineSets,
          }
        })
        .filter(Boolean)

      setMachineHistory(prev => ({ ...prev, [machineId]: entries }))
      setMachineHistoryStatus(prev => ({ ...prev, [machineId]: 'done' }))
    } catch (error) {
      addLog({ level: 'error', event: 'machine_history.failed', message: error?.message || 'Failed to load machine history.' })
      setMachineHistoryStatus(prev => ({ ...prev, [machineId]: 'error' }))
    }
  }, [machineHistory, machineHistoryStatus, sets, machines])

  const trainingBuckets = useMemo(() => buildTrainingBuckets(sets, machines), [sets, machines])
  const resolvedFlags = featureFlagsLoading ? DEFAULT_FLAGS : featureFlags
  const setCentricLoggingEnabled = resolvedFlags.setCentricLogging
  const libraryEnabled = resolvedFlags.libraryScreenEnabled
  const analysisOnDemandOnly = resolvedFlags.analysisOnDemandOnly

  useEffect(() => {
    if (!featureFlagsLoading) return
    addLog({ level: 'info', event: 'feature_flags.defaults_applied', message: 'Using safe default flags until remote flags are loaded.' })
  }, [featureFlagsLoading])

  useEffect(() => {
    if (featureFlagsLoading || libraryEnabled || screen !== 'library') return
    addLog({ level: 'warn', event: 'feature_flags.library_fallback', message: 'Library screen disabled; redirecting to home.' })
    setScreen('home')
  }, [featureFlagsLoading, libraryEnabled, screen])

  // ─── Loading / Auth ──────────────────────────────────────
  if (user === undefined) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>Loading...</div>
      </div>
    )
  }
  if (!user) return <AuthScreen onAuth={loadData} />

  // ─── Screens ─────────────────────────────────────────────
  return (
    <>
      {screen === 'home' && (
        <HomeScreen
          pendingSoreness={pendingSoreness}
          machines={machines}
          libraryEnabled={libraryEnabled}
          onLogSets={() => setScreen('log')}
          onLibrary={() => {
            if (!libraryEnabled) {
              addLog({ level: 'warn', event: 'feature_flags.library_fallback', message: 'Library entry is disabled by feature flag.' })
              return
            }
            setScreen('library')
          }}
          onHistory={() => setScreen('history')}
          onAnalysis={() => {
            setAnalysisInitialTab('run')
            setScreen('analysis')
          }}
          onDiagnostics={() => setScreen('diagnostics')}
          onSorenessSubmit={handleSorenessSubmit}
          onSorenessDismiss={handleSorenessDismiss}
          onSignOut={async () => { await signOut(); setUser(null); setScreen('home') }}
        />
      )}
      {screen === 'log' && (
        <LogSetScreen
          sets={sets}
          machines={machines}
          machineHistory={machineHistory}
          onLoadMachineHistory={loadMachineHistory}
          onLogSet={handleLogSet}
          onDeleteSet={handleDeleteSet}
          onBack={() => setScreen('home')}
          onOpenLibrary={() => {
            if (!libraryEnabled) {
              addLog({ level: 'warn', event: 'feature_flags.library_fallback', message: 'Library entry from log screen is disabled by feature flag.' })
              return
            }
            setScreen('library')
          }}
          libraryEnabled={libraryEnabled}
          setCentricLoggingEnabled={setCentricLoggingEnabled}
        />
      )}
      {libraryEnabled && screen === 'library' && (
        <LibraryScreen
          machines={machines}
          onSaveMachine={handleSaveMachine}
          onDeleteMachine={handleDeleteMachine}
          onBack={() => setScreen('home')}
        />
      )}
      {screen === 'history' && (
        <HistoryScreen
          trainingBuckets={trainingBuckets}
          machines={machines}
          onBack={() => setScreen('home')}
        />
      )}
      {screen === 'analysis' && (
        <AnalysisScreen
          machines={machines}
          machineHistory={machineHistory}
          onLoadMachineHistory={loadMachineHistory}
          onBack={() => setScreen('home')}
          initialTab={analysisInitialTab}
          analysisOnDemandOnly={analysisOnDemandOnly}
          trainingBuckets={trainingBuckets}
          sorenessHistory={sorenessHistory}
        />
      )}
      {screen === 'diagnostics' && (
        <DiagnosticsScreen
          user={user}
          onBack={() => setScreen('home')}
        />
      )}
    </>
  )
}
