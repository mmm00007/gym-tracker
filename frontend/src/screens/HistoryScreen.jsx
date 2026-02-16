import React from 'react'
import { Chip, PageScaffold, SectionCard, TopAppBar } from '../components/uiPrimitives'

const fmtFull = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const fmtDur = (ms) => { const m = Math.floor(ms / 60000); return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m` }

export default function HistoryScreen({ trainingBuckets, machines, onBack, getMuscleColor }) {
  return (
    <PageScaffold>
      <TopAppBar left={<button onClick={onBack} style={{ color: 'var(--text-muted)', fontSize: 15, padding: 4 }}>← Back</button>} title="HISTORY" />
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
              <SectionCard key={bucket.training_bucket_id}>
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
                    return <Chip key={movement} text={movement} color={getMuscleColor(machine?.muscle_groups?.[0])} />
                  })}
                </div>
              </SectionCard>
            )
          })}
        </div>
      )}
    </PageScaffold>
  )
}
