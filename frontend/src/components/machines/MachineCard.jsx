function MusclePill({ text, color }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 11,
        color,
        border: `1px solid ${color}44`,
        borderRadius: 999,
        padding: '2px 8px',
      }}
    >
      {text}
    </span>
  )
}

export default function MachineCard({ machine, onSelect, onEdit, compact, usageBadge, getMuscleColor }) {
  const primaryColor = getMuscleColor(machine.muscle_groups?.[0])
  const thumbnails = Array.isArray(machine.thumbnails)
    ? machine.thumbnails
      .map((thumb) => {
        if (typeof thumb === 'string') return { src: thumb, focalX: 50, focalY: 35 }
        if (!thumb || typeof thumb !== 'object' || typeof thumb.src !== 'string') return null
        return {
          src: thumb.src,
          focalX: Number.isFinite(Number(thumb.focalX)) ? Number(thumb.focalX) : 50,
          focalY: Number.isFinite(Number(thumb.focalY)) ? Number(thumb.focalY) : 35,
        }
      })
      .filter(Boolean)
    : []
  const thumb = thumbnails[0]

  return (
    <div
      onClick={onSelect}
      className={`machine-card ${compact ? 'machine-card--compact' : ''}`.trim()}
      style={{ borderLeft: `3px solid ${primaryColor}` }}
    >
      <div className="machine-card__image-wrap">
        {thumb ? (
          <img src={thumb.src} alt="" className="machine-card__image" style={{ objectPosition: `${thumb.focalX}% ${thumb.focalY}%` }} />
        ) : (
          <span className="machine-card__placeholder">🏋️</span>
        )}
        <div className="machine-card__image-overlay" aria-hidden="true" />
        <div className="machine-card__image-label">{machine.movement || 'Exercise'}</div>
        {thumbnails.length > 1 && (
          <div className="machine-card__thumb-count">+{thumbnails.length - 1}</div>
        )}
      </div>

      <div className="machine-card__content-row">
        <div className="machine-card__content-main">
          <div className="machine-card__title">{machine.name}</div>
          {usageBadge && (
            <div className="machine-card__usage-badge">
              <span style={{ fontFamily: 'var(--font-code)' }}>{usageBadge}</span>
            </div>
          )}
          <div className="machine-card__pill-row">
            {machine.muscle_groups?.map((group, i) => (
              <MusclePill key={`${group}-${i}`} text={group} color={getMuscleColor(group)} />
            ))}
          </div>
        </div>
        {onEdit && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onEdit()
            }}
            className="machine-card__edit-btn"
          >
            ✎
          </button>
        )}
      </div>
    </div>
  )
}
