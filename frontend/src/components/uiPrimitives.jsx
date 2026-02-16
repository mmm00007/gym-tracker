import React from 'react'

export function PageScaffold({ children, className = '', style }) {
  return <div className={`page-scaffold ${className}`.trim()} style={style}>{children}</div>
}

export function TopAppBar({ left, title, right }) {
  return (
    <div className="top-app-bar">
      <div className="top-app-bar__slot top-app-bar__slot--left">{left}</div>
      <span className="top-app-bar__title">{title}</span>
      <div className="top-app-bar__slot top-app-bar__slot--right">{right}</div>
    </div>
  )
}

export function IconButton({ children, onClick, className = '', title, type = 'button' }) {
  return (
    <button type={type} onClick={onClick} title={title} className={`icon-button ${className}`.trim()}>
      {children}
    </button>
  )
}

export function SectionCard({ children, className = '', style }) {
  return <section className={`section-card ${className}`.trim()} style={style}>{children}</section>
}

export function Chip({ text, color }) {
  const chipStyle = {
    '--chip-color': color || '#888',
  }
  return <span className="chip" style={chipStyle}>{text}</span>
}

export function SegmentedButtons({ label, options, value, onChange }) {
  return (
    <div>
      {label && <div className="segmented-buttons__label">{label}</div>}
      <div className="segmented-buttons__row">
        {options.map((option) => {
          const active = value === option.value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`segmented-buttons__button ${active ? 'is-active' : ''}`.trim()}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
