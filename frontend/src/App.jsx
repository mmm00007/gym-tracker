import { useState, useEffect, useCallback, useRef } from 'react'
import {
  supabase, signUp, signIn, signOut, getSession,
  getMachines, upsertMachine, deleteMachine as dbDeleteMachine,
  getSessions, createSession, endSession as dbEndSession, getActiveSession,
  getSetsForSession, logSet as dbLogSet, deleteSet as dbDeleteSet,
  getPendingSoreness, submitSoreness, getRecentSoreness,
} from './lib/supabase'
import { identifyMachine, getRecommendations } from './lib/api'

// ─── Helpers ───────────────────────────────────────────────
const fmt = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const fmtFull = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const fmtTime = (d) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
const fmtDur = (ms) => { const m = Math.floor(ms / 60000); return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m` }
const fmtTimer = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

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
  return (
    <div onClick={onSelect} style={{
      background: 'linear-gradient(135deg, var(--surface), var(--surface2))', border: '1px solid var(--border)',
      borderRadius: 14, padding: compact ? 12 : 16, cursor: 'pointer', borderLeft: `3px solid ${primaryColor}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
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
            padding: '4px 10px', fontSize: 12,
          }}>✎</button>
        )}
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
    onSubmit(session.id, reports)
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

function HomeScreen({ activeSession, pendingSoreness, machines, onStart, onResume, onHistory, onSorenessSubmit, onSorenessDismiss, onSignOut }) {
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

      {/* Soreness prompts */}
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
            onSubmit={onSorenessSubmit} onDismiss={() => onSorenessDismiss(s.id)} />
        )
      })}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {activeSession ? (
          <button onClick={onResume} style={{
            background: 'var(--accent)11', border: '2px solid var(--accent)',
            borderRadius: 16, padding: 24, textAlign: 'left',
          }}>
            <div style={{ fontSize: 12, color: 'var(--accent)', letterSpacing: 2, marginBottom: 8, fontFamily: 'var(--font-code)' }}>● ACTIVE SESSION</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Resume Workout</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Started {fmtTime(activeSession.started_at)}</div>
          </button>
        ) : (
          <button onClick={onStart} style={{
            background: 'linear-gradient(135deg, var(--accent), var(--accent-dark))', borderRadius: 16,
            padding: 28, textAlign: 'center', boxShadow: '0 0 40px var(--accent)33',
          }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>💪</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#000', fontFamily: 'var(--font-mono)' }}>START WORKOUT</div>
          </button>
        )}

        <button onClick={onHistory} style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, textAlign: 'left',
        }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>📊 History & Insights</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Past sessions & AI recommendations</div>
        </button>
      </div>
    </div>
  )
}

// ─── Camera Screen ─────────────────────────────────────────

function CameraScreen({ onIdentified, onCancel }) {
  const [images, setImages] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const cameraRef = useRef()
  const galleryRef = useRef()

  const readFileAsBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read that image file. Please try again.'))
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Invalid image data. Please choose a different photo.'))
        return
      }
      const base64 = reader.result.split(',')[1]
      if (!base64) {
        reject(new Error('Empty image data detected. Please reselect the photo.'))
        return
      }
      resolve(base64)
    }
    reader.readAsDataURL(file)
  })

  const handleFiles = async (files) => {
    if (!files || files.length === 0) return
    const available = 3 - images.length
    if (available <= 0) {
      setError('You can only upload up to 3 photos.')
      return
    }
    let lastError = null
    const newImgs = []
    for (const f of Array.from(files).slice(0, available)) {
      try {
        const data = await readFileAsBase64(f)
        newImgs.push({ data, media_type: f.type || 'image/jpeg', preview: URL.createObjectURL(f) })
      } catch (err) {
        lastError = err
      }
    }
    if (newImgs.length) {
      setImages(prev => [...prev, ...newImgs].slice(0, 3))
    }
    if (lastError) {
      setError(lastError.message)
    } else {
      setError(null)
    }
  }

  const analyze = async () => {
    setLoading(true); setError(null)
    try {
      const result = await identifyMachine(images.map(i => ({ data: i.data, media_type: i.media_type })))
      onIdentified(result)
    } catch (e) {
      setError(e.message || 'Could not identify. Try clearer photos.')
      console.error(e)
    }
    setLoading(false)
  }

  return (
    <div style={{ padding: '20px 16px', minHeight: '100dvh' }}>
      <TopBar left={<BackBtn onClick={onCancel} />} title="IDENTIFY MACHINE" />

      <div style={{
        border: '2px dashed var(--border-light)', borderRadius: 16, padding: 24, textAlign: 'center',
        marginBottom: 16, background: 'var(--surface)',
      }}>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment"
          onChange={async (e) => { await handleFiles(e.target.files); e.target.value = '' }} style={{ display: 'none' }} />
        <input ref={galleryRef} type="file" accept="image/*" multiple
          onChange={async (e) => { await handleFiles(e.target.files); e.target.value = '' }} style={{ display: 'none' }} />
        <div style={{ fontSize: 40, marginBottom: 12 }}>📸</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#ccc', marginBottom: 8 }}>Add up to 3 photos</div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
          <button onClick={() => cameraRef.current?.click()} style={{
            padding: '10px 16px', borderRadius: 10, fontSize: 14, fontWeight: 700,
            background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)',
          }}>Take Photo</button>
          <button onClick={() => galleryRef.current?.click()} style={{
            padding: '10px 16px', borderRadius: 10, fontSize: 14, fontWeight: 700,
            background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)',
          }}>Gallery</button>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>{images.length}/3 selected</div>
      </div>

      {images.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, overflowX: 'auto', paddingBottom: 8 }}>
          {images.map((img, i) => (
            <div key={i} style={{ position: 'relative', flexShrink: 0 }}>
              <img src={img.preview} alt="" style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 12, border: '1px solid var(--border)' }} />
              <button onClick={() => setImages(images.filter((_, j) => j !== i))} style={{
                position: 'absolute', top: -6, right: -6, width: 24, height: 24, borderRadius: 12,
                background: 'var(--red)', color: '#fff', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>×</button>
            </div>
          ))}
        </div>
      )}

      {error && <div style={{ color: 'var(--red)', fontSize: 14, marginBottom: 16, textAlign: 'center' }}>{error}</div>}

      <button onClick={analyze} disabled={!images.length || loading} style={{
        width: '100%', padding: 18, borderRadius: 14, fontSize: 18, fontWeight: 800,
        background: images.length ? 'linear-gradient(135deg, var(--accent), var(--accent-dark))' : 'var(--border)',
        color: images.length ? '#000' : 'var(--text-dim)', fontFamily: 'var(--font-mono)',
        opacity: loading ? 0.7 : 1,
      }}>
        {loading ? '⚙ Analyzing...' : `Identify${images.length ? ` (${images.length})` : ''}`}
      </button>
    </div>
  )
}

// ─── Edit Machine ──────────────────────────────────────────

function EditMachineScreen({ machine, onSave, onCancel, onDelete }) {
  const [form, setForm] = useState({ ...machine })
  const upd = (k, v) => setForm({ ...form, [k]: v })

  const fields = [
    ['name', 'Machine Name', 'text'],
    ['movement', 'Movement', 'text'],
    ['exercise_type', 'Type (Push/Pull/Legs/Core)', 'text'],
    ['notes', 'Form Tips & Notes', 'textarea'],
  ]

  return (
    <div style={{ padding: '20px 16px', minHeight: '100dvh' }}>
      <TopBar left={<BackBtn onClick={onCancel} />} title="EDIT MACHINE" />

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
        <label style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 6, fontFamily: 'var(--font-code)' }}>Muscle Groups (comma-separated)</label>
        <input value={(form.muscle_groups || []).join(', ')}
          onChange={(e) => upd('muscle_groups', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
          style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, color: 'var(--text)', fontSize: 16, boxSizing: 'border-box' }} />
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
        <button onClick={() => onSave(form)} style={{
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

// ─── Session Screen ────────────────────────────────────────

function SessionScreen({ session, sets, machines, onLogSet, onDeleteSet, onEndSession, onBack, onSaveMachine, onDeleteMachine }) {
  const [view, setView] = useState('log')
  const [selectedMachine, setSelectedMachine] = useState(null)
  const [editingMachine, setEditingMachine] = useState(null)
  const [reps, setReps] = useState(10)
  const [weight, setWeight] = useState(20)
  const [restSeconds, setRestSeconds] = useState(0)
  const [logging, setLogging] = useState(false)
  const restRef = useRef(null)
  const lastSetTime = useRef(null)

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

  const selectMachine = (m) => {
    setSelectedMachine(m)
    const machineSets = sets.filter(s => s.machine_id === m.id)
    if (machineSets.length) {
      const last = machineSets[machineSets.length - 1]
      setReps(last.reps); setWeight(last.weight)
    } else {
      setReps(m.default_reps || 10); setWeight(m.default_weight || 20)
    }
    setView('log')
  }

  const handleLog = async () => {
    if (!selectedMachine || logging) return
    setLogging(true)
    const rest = lastSetTime.current ? Math.floor((Date.now() - lastSetTime.current) / 1000) : null
    await onLogSet(selectedMachine.id, reps, weight, null, rest)
    lastSetTime.current = Date.now()
    setRestSeconds(0)
    if (navigator.vibrate) navigator.vibrate(50)
    setLogging(false)
  }

  // Camera view
  if (view === 'camera') {
    return <CameraScreen onCancel={() => setView('log')} onIdentified={async (data) => {
      // Transform LLM response keys to DB column names
      const machineData = {
        name: data.name,
        movement: data.movement,
        exercise_type: data.exerciseType,
        muscle_groups: data.muscleGroups || [],
        variations: data.variations || [],
        default_weight: data.defaultWeight || 20,
        default_reps: data.defaultReps || 10,
        notes: data.notes || '',
      }
      const saved = await onSaveMachine(machineData)
      selectMachine(saved)
    }} />
  }

  // Edit view
  if (view === 'edit' && editingMachine) {
    return <EditMachineScreen machine={editingMachine}
      onSave={async (m) => { const saved = await onSaveMachine(m); selectMachine(saved); setEditingMachine(null); setView('log') }}
      onCancel={() => { setEditingMachine(null); setView('log') }}
      onDelete={async (id) => { await onDeleteMachine(id); if (selectedMachine?.id === id) setSelectedMachine(null); setEditingMachine(null); setView('log') }}
    />
  }

  // Select view
  if (view === 'select') {
    return (
      <div style={{ padding: '20px 16px', minHeight: '100dvh' }}>
        <TopBar left={<BackBtn onClick={() => setView('log')} />} title="SELECT MACHINE" />
        <button onClick={() => setView('camera')} style={{
          width: '100%', padding: 18, borderRadius: 14, border: '2px dashed var(--accent)66',
          background: 'var(--accent)11', color: 'var(--accent)', fontSize: 16, fontWeight: 700,
          marginBottom: 16, fontFamily: 'var(--font-mono)',
        }}>📸 Identify New Machine</button>
        {machines.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏋️</div>
            <div>No machines yet. Take a photo!</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {machines.map(m => <MachineCard key={m.id} machine={m} onSelect={() => selectMachine(m)}
              onEdit={() => { setEditingMachine(m); setView('edit') }} />)}
          </div>
        )}
      </div>
    )
  }

  // Main log view
  const setsForMachine = selectedMachine ? sets.filter(s => s.machine_id === selectedMachine.id) : []

  return (
    <div style={{ padding: '20px 16px', paddingBottom: 100, minHeight: '100dvh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <BackBtn onClick={onBack} />
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: 'var(--accent)', letterSpacing: 2, fontFamily: 'var(--font-code)', animation: 'pulse 2s infinite' }}>● LIVE</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{fmtDur(Date.now() - new Date(session.started_at).getTime())}</div>
        </div>
      </div>

      {/* Machine selector button */}
      <button onClick={() => setView('select')} style={{
        width: '100%', padding: 16, borderRadius: 14, cursor: 'pointer', textAlign: 'left', marginBottom: 16,
        border: selectedMachine ? `2px solid ${mc(selectedMachine.muscle_groups?.[0])}44` : '2px dashed var(--text-dim)',
        background: selectedMachine ? 'var(--surface)' : 'var(--surface)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        {selectedMachine ? (
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{selectedMachine.movement}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{selectedMachine.name}</div>
          </div>
        ) : (
          <div style={{ color: 'var(--text-muted)', fontSize: 15 }}>Tap to select a machine</div>
        )}
        <span style={{ color: 'var(--text-dim)', fontSize: 20 }}>›</span>
      </button>

      {selectedMachine && (
        <>
          {selectedMachine.notes && (
            <div style={{ background: '#1a1a2e', borderRadius: 12, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#88a', borderLeft: '3px solid #4444ff' }}>
              💡 {selectedMachine.notes}
            </div>
          )}

          {/* Rest timer */}
          {sets.length > 0 && restSeconds > 0 && <RestTimer seconds={restSeconds} />}

          <SliderInput label="Reps" value={reps} onChange={setReps} min={1} max={30} step={1} unit="" color="var(--accent)" />
          <QuickAdjust value={reps} onChange={setReps} step={1} color="var(--accent)" min={1} />
          <SliderInput label="Weight" value={weight} onChange={setWeight} min={0} max={200} step={2.5} unit="kg" color="var(--blue)" />
          <QuickAdjust value={weight} onChange={setWeight} step={2.5} color="var(--blue)" />

          <button onClick={handleLog} disabled={logging} style={{
            width: '100%', padding: 20, borderRadius: 14, fontSize: 20, fontWeight: 900,
            background: 'linear-gradient(135deg, var(--accent), var(--accent-dark))', color: '#000',
            fontFamily: 'var(--font-mono)', marginBottom: 24, boxShadow: '0 0 30px var(--accent)33',
            opacity: logging ? 0.6 : 1,
          }}>LOG SET ✓</button>

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
                    <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>kg</span>
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
                  <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>kg</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <button onClick={onEndSession} style={{
        position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
        width: 'calc(100% - 32px)', maxWidth: 448, padding: 16, borderRadius: 14,
        border: '2px solid var(--red)44', background: '#1a0a0aee', color: 'var(--red)',
        fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-mono)',
        backdropFilter: 'blur(10px)', zIndex: 10,
      }}>END SESSION</button>
    </div>
  )
}

// ─── Summary Screen ────────────────────────────────────────

function SummaryScreen({ session, sets, machines, recommendations, onDone }) {
  const byMachine = {}
  sets.forEach(s => { (byMachine[s.machine_id] ??= []).push(s) })

  return (
    <div style={{ padding: '20px 16px', minHeight: '100dvh' }} className="fade-in">
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🎯</div>
        <h2 style={{ fontSize: 24, fontWeight: 900, color: 'var(--text)', margin: 0, fontFamily: 'var(--font-mono)' }}>Session Complete</h2>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
          {fmtFull(session.started_at)} · {session.ended_at ? fmtDur(new Date(session.ended_at) - new Date(session.started_at)) : ''} · {sets.length} sets
        </div>
      </div>

      {Object.entries(byMachine).map(([mid, mSets]) => {
        const m = machines.find(ma => ma.id === mid)
        return (
          <div key={mid} style={{
            background: 'var(--surface)', borderRadius: 14, padding: 14, marginBottom: 10,
            borderLeft: `3px solid ${mc(m?.muscle_groups?.[0])}`,
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#ccc', marginBottom: 6 }}>{m?.movement || 'Unknown'}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {mSets.map((s, i) => (
                <span key={i} style={{
                  padding: '4px 10px', borderRadius: 8, background: 'var(--surface2)', fontSize: 14, fontFamily: 'var(--font-mono)', color: '#aaa',
                }}><span style={{ color: 'var(--accent)' }}>{s.reps}</span>×<span style={{ color: 'var(--blue)' }}>{s.weight}</span></span>
              ))}
            </div>
          </div>
        )
      })}

      {recommendations ? (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 12, color: 'var(--accent)', letterSpacing: 2, marginBottom: 12, fontFamily: 'var(--font-code)' }}>🤖 AI INSIGHTS</div>
          <div style={{ background: '#1a1a2e', borderRadius: 14, padding: 16, marginBottom: 12, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 15, color: '#ccc', lineHeight: 1.5 }}>{recommendations.summary}</div>
          </div>
          {recommendations.highlights?.map((h, i) => (
            <div key={i} style={{ padding: '8px 12px', background: '#0a1a1a', borderRadius: 10, marginBottom: 6, fontSize: 14, color: '#aaa', borderLeft: '3px solid #4ecdc4' }}>{h}</div>
          ))}
          {recommendations.suggestions?.map((s, i) => (
            <div key={i} style={{ padding: '8px 12px', background: '#1a1a0a', borderRadius: 10, marginBottom: 6, fontSize: 14, color: '#aaa', borderLeft: '3px solid #ffe66d' }}>{s}</div>
          ))}
          {recommendations.nextSession && (
            <div style={{ background: '#1a0a2e', borderRadius: 12, padding: '10px 14px', marginTop: 8, fontSize: 14, color: '#c9b1ff', borderLeft: '3px solid #c9b1ff' }}>
              <span style={{ fontWeight: 700 }}>Next time:</span> {recommendations.nextSession}
            </div>
          )}
          {recommendations.progressNotes && (
            <div style={{ background: '#0a1a0a', borderRadius: 12, padding: '10px 14px', marginTop: 8, fontSize: 14, color: '#88d8b0', borderLeft: '3px solid #88d8b0' }}>
              <span style={{ fontWeight: 700 }}>Progress:</span> {recommendations.progressNotes}
            </div>
          )}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-dim)' }}>
          <div style={{ animation: 'spin 2s linear infinite', display: 'inline-block', fontSize: 24 }}>⚙</div>
          <div style={{ marginTop: 8 }}>Generating AI insights...</div>
        </div>
      )}

      <button onClick={onDone} style={{
        width: '100%', padding: 18, borderRadius: 14, fontSize: 18, fontWeight: 800,
        background: 'linear-gradient(135deg, var(--accent), var(--accent-dark))', color: '#000',
        fontFamily: 'var(--font-mono)', marginTop: 24,
      }}>Done</button>
    </div>
  )
}

// ─── History Screen ────────────────────────────────────────

function HistoryScreen({ sessions, machines, onBack, onViewSession }) {
  return (
    <div style={{ padding: '20px 16px', minHeight: '100dvh' }}>
      <TopBar left={<BackBtn onClick={onBack} />} title="HISTORY" />
      {sessions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 16 }}>No sessions yet</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {sessions.map(s => (
            <div key={s.id} onClick={() => onViewSession(s)} style={{
              background: 'var(--surface)', borderRadius: 14, padding: 16, cursor: 'pointer', border: '1px solid var(--border)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{fmtFull(s.started_at)}</div>
                {s.ended_at && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{fmtDur(new Date(s.ended_at) - new Date(s.started_at))}</div>}
              </div>
              {s.recommendations?.summary && (
                <div style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic', lineHeight: 1.4, marginTop: 4 }}>{s.recommendations.summary}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main App ──────────────────────────────────────────────

export default function App() {
  const [user, setUser] = useState(undefined) // undefined=loading, null=logged out
  const [screen, setScreen] = useState('home')
  const [machines, setMachines] = useState([])
  const [activeSession, setActiveSession] = useState(null)
  const [currentSets, setCurrentSets] = useState([])
  const [sessions, setSessions] = useState([])
  const [pendingSoreness, setPendingSoreness] = useState([])
  const [summarySession, setSummarySession] = useState(null)
  const [summarySets, setSummarySets] = useState([])
  const [recommendations, setRecommendations] = useState(null)

  // Auth listener
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user || null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Load data when user is authenticated
  const loadData = useCallback(async () => {
    if (!user) return
    try {
      const [m, s, active] = await Promise.all([getMachines(), getSessions(), getActiveSession()])
      setMachines(m)
      setSessions(s.filter(se => se.ended_at))
      setActiveSession(active)
      if (active) {
        const sets = await getSetsForSession(active.id)
        setCurrentSets(sets)
      }
      // Check pending soreness
      const pending = await getPendingSoreness()
      // Enrich with sets data for muscle group extraction
      const enriched = await Promise.all(pending.map(async (p) => {
        const sets = await getSetsForSession(p.id)
        return { ...p, _sets: sets }
      }))
      setPendingSoreness(enriched)
    } catch (e) {
      console.error('Load error:', e)
    }
  }, [user])

  useEffect(() => { if (user) loadData() }, [user, loadData])

  // ─── Actions ─────────────────────────────────────────────
  const handleStartSession = async () => {
    const s = await createSession()
    setActiveSession(s)
    setCurrentSets([])
    setScreen('session')
  }

  const handleLogSet = async (machineId, reps, weight, duration, rest) => {
    const s = await dbLogSet(activeSession.id, machineId, reps, weight, duration, rest)
    setCurrentSets(prev => [...prev, s])
  }

  const handleDeleteSet = async (id) => {
    await dbDeleteSet(id)
    setCurrentSets(prev => prev.filter(s => s.id !== id))
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

  const handleEndSession = async () => {
    if (!activeSession) return
    if (currentSets.length === 0) {
      // Empty session, just delete it
      await dbEndSession(activeSession.id, null)
      setActiveSession(null)
      setCurrentSets([])
      setScreen('home')
      return
    }

    // Build summary data
    const sessionData = {
      ...activeSession,
      sets: currentSets.map(s => ({
        machine_id: s.machine_id,
        reps: s.reps,
        weight: s.weight,
        rest_seconds: s.rest_seconds,
        logged_at: s.logged_at,
        machine_name: machines.find(m => m.id === s.machine_id)?.movement || 'Unknown',
      })),
    }

    setSummarySession(activeSession)
    setSummarySets(currentSets)
    setRecommendations(null)
    setScreen('summary')

    // End in DB
    await dbEndSession(activeSession.id, null)

    // Get recs
    try {
      const pastData = await Promise.all(sessions.slice(0, 50).map(async (s) => {
        const sets = await getSetsForSession(s.id)
        return {
          started_at: s.started_at,
          ended_at: s.ended_at,
          sets: sets.map(st => ({
            reps: st.reps, weight: st.weight, rest_seconds: st.rest_seconds,
            machine_name: machines.find(m => m.id === st.machine_id)?.movement || 'Unknown',
          })),
        }
      }))

      const machinesMap = {}
      machines.forEach(m => { machinesMap[m.id] = { name: m.name, movement: m.movement, muscle_groups: m.muscle_groups } })

      const soreness = await getRecentSoreness()
      const recs = await getRecommendations(sessionData, pastData, machinesMap, soreness)
      setRecommendations(recs)

      // Save recs to session
      await dbEndSession(activeSession.id, recs)
    } catch (e) {
      console.error('Recs error:', e)
      setRecommendations({ summary: 'Could not generate insights.', highlights: [], suggestions: [], nextSession: '' })
    }

    setActiveSession(null)
    setCurrentSets([])
    // Refresh sessions list
    const updated = await getSessions()
    setSessions(updated.filter(s => s.ended_at))
  }

  const handleSorenessSubmit = async (sessionId, reports) => {
    await submitSoreness(sessionId, reports)
    setPendingSoreness(prev => prev.filter(s => s.id !== sessionId))
  }

  const handleSorenessDismiss = (sessionId) => {
    setPendingSoreness(prev => prev.filter(s => s.id !== sessionId))
  }

  const handleViewHistorySession = async (session) => {
    const sets = await getSetsForSession(session.id)
    setSummarySession(session)
    setSummarySets(sets)
    setRecommendations(session.recommendations || null)
    setScreen('summary')
  }

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
          activeSession={activeSession} pendingSoreness={pendingSoreness}
          machines={machines} onStart={handleStartSession}
          onResume={() => setScreen('session')} onHistory={() => setScreen('history')}
          onSorenessSubmit={handleSorenessSubmit} onSorenessDismiss={handleSorenessDismiss}
          onSignOut={async () => { await signOut(); setUser(null); setScreen('home') }}
        />
      )}
      {screen === 'session' && activeSession && (
        <SessionScreen
          session={activeSession} sets={currentSets} machines={machines}
          onLogSet={handleLogSet} onDeleteSet={handleDeleteSet}
          onEndSession={handleEndSession} onBack={() => setScreen('home')}
          onSaveMachine={handleSaveMachine} onDeleteMachine={handleDeleteMachine}
        />
      )}
      {screen === 'summary' && summarySession && (
        <SummaryScreen
          session={summarySession} sets={summarySets} machines={machines}
          recommendations={recommendations}
          onDone={() => { setScreen('home'); setSummarySession(null); setRecommendations(null) }}
        />
      )}
      {screen === 'history' && (
        <HistoryScreen
          sessions={sessions} machines={machines}
          onBack={() => setScreen('home')}
          onViewSession={handleViewHistorySession}
        />
      )}
    </>
  )
}
