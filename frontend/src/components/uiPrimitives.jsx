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
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value))
  const optionRefs = React.useRef([])

  const focusOptionByIndex = (index) => {
    const nextIndex = (index + options.length) % options.length
    optionRefs.current[nextIndex]?.focus()
  }

  const onOptionKeyDown = (event, optionIndex) => {
    if (!options.length) return
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      const nextIndex = (optionIndex + 1) % options.length
      onChange(options[nextIndex].value)
      focusOptionByIndex(nextIndex)
      return
    }

    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      const prevIndex = (optionIndex - 1 + options.length) % options.length
      onChange(options[prevIndex].value)
      focusOptionByIndex(prevIndex)
      return
    }

    if (event.key === 'Home') {
      event.preventDefault()
      onChange(options[0].value)
      focusOptionByIndex(0)
      return
    }

    if (event.key === 'End') {
      event.preventDefault()
      const lastIndex = options.length - 1
      onChange(options[lastIndex].value)
      focusOptionByIndex(lastIndex)
    }
  }

  return (
    <div>
      {label && <div className="segmented-buttons__label">{label}</div>}
      <div className="segmented-buttons__row" role="tablist" aria-label={label || 'Segmented controls'}>
        {options.map((option, optionIndex) => {
          const active = value === option.value
          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={active}
              tabIndex={active || optionIndex === selectedIndex ? 0 : -1}
              ref={(node) => { optionRefs.current[optionIndex] = node }}
              onClick={() => onChange(option.value)}
              onKeyDown={(event) => onOptionKeyDown(event, optionIndex)}
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
