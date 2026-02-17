import React from 'react'
import { Chip, PageScaffold, SectionCard, TopAppBar } from '../components/uiPrimitives'

const fmtFull = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const fmtDur = (ms) => { const m = Math.floor(ms / 60000); return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m` }

export default function HistoryScreen({ trainingBuckets, machines, onBack, getMuscleColor }) {
  return (
    <PageScaffold className="screen-frame">
      <TopAppBar left={<button onClick={onBack} style={{ color: 'var(--text-muted)', fontSize: 15, padding: 4 }}>← Back</button>} title="HISTORY" />
      {trainingBuckets.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 16 }}>No sets logged yet</div>
        </div>
      ) : (
        <div className="history-screen__list">
          {trainingBuckets.slice().reverse().map((bucket) => {
            const durationMs = new Date(bucket.ended_at) - new Date(bucket.started_at)
            const setCount = bucket.sets.length
            const uniqueMovements = [...new Set(bucket.sets.map((set) => set.machine_name))]
            return (
              <SectionCard key={bucket.training_bucket_id}>
                <div className="history-screen__header-row">
                  <div className="history-screen__date">{fmtFull(bucket.started_at)}</div>
                  <div className="history-screen__duration">{fmtDur(durationMs)}</div>
                </div>
                <div className="history-screen__summary">
                  {setCount} sets · {uniqueMovements.length} exercises
                </div>
                <div className="history-screen__chips">
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
