import { useEffect, useMemo, useRef, useState } from 'react'

export default function Accordion({
  sections,
  expandedSections,
  onToggle,
  ariaLabel = 'Accordion sections',
}) {
  const buttonRefs = useRef([])
  const contentRefs = useRef({})
  const [sectionHeights, setSectionHeights] = useState({})

  useEffect(() => {
    const nextHeights = {}
    sections.forEach((section) => {
      nextHeights[section.key] = contentRefs.current[section.key]?.scrollHeight || 0
    })
    setSectionHeights(nextHeights)
  }, [sections, expandedSections])

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return undefined

    const observer = new ResizeObserver(() => {
      const nextHeights = {}
      sections.forEach((section) => {
        nextHeights[section.key] = contentRefs.current[section.key]?.scrollHeight || 0
      })
      setSectionHeights(nextHeights)
    })

    sections.forEach((section) => {
      if (contentRefs.current[section.key]) {
        observer.observe(contentRefs.current[section.key])
      }
    })

    return () => observer.disconnect()
  }, [sections])

  const sectionIndexByKey = useMemo(() => Object.fromEntries(sections.map((section, index) => [section.key, index])), [sections])

  const focusSectionByIndex = (index) => {
    if (!sections.length) return
    const normalized = (index + sections.length) % sections.length
    buttonRefs.current[normalized]?.focus()
  }

  const onHeaderKeyDown = (event, sectionKey) => {
    const sectionIndex = sectionIndexByKey[sectionKey]
    if (sectionIndex === undefined) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      focusSectionByIndex(sectionIndex + 1)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      focusSectionByIndex(sectionIndex - 1)
      return
    }

    if (event.key === 'Home') {
      event.preventDefault()
      focusSectionByIndex(0)
      return
    }

    if (event.key === 'End') {
      event.preventDefault()
      focusSectionByIndex(sections.length - 1)
    }
  }

  return (
    <div className="accordion" aria-label={ariaLabel}>
      {sections.map((section, index) => {
        const isExpanded = expandedSections[section.key]
        const sectionId = `accordion-section-${section.key}`
        const sectionButtonId = `${sectionId}-button`
        const sectionPanelId = `${sectionId}-panel`

        return (
          <section key={section.key} className="accordion__section">
            <h3 className="accordion__heading">
              <button
                type="button"
                ref={(node) => { buttonRefs.current[index] = node }}
                id={sectionButtonId}
                className="accordion__trigger"
                aria-expanded={isExpanded}
                aria-controls={sectionPanelId}
                onClick={() => onToggle(section.key)}
                onKeyDown={(event) => onHeaderKeyDown(event, section.key)}
              >
                <span className="accordion__label">{section.label}</span>
                <span className={`accordion__chevron ${isExpanded ? 'is-expanded' : ''}`.trim()} aria-hidden="true">▾</span>
              </button>
            </h3>
            <div
              id={sectionPanelId}
              role="region"
              aria-labelledby={sectionButtonId}
              aria-hidden={!isExpanded}
              className="accordion__panel"
              style={{
                maxHeight: isExpanded ? `${sectionHeights[section.key] || 0}px` : '0px',
                opacity: isExpanded ? 1 : 0,
                transform: `translateY(${isExpanded ? 0 : -4}px)`,
                pointerEvents: isExpanded ? 'auto' : 'none',
              }}
            >
              <div ref={(node) => { contentRefs.current[section.key] = node }}>
                {section.content}
              </div>
            </div>
          </section>
        )
      })}
    </div>
  )
}
