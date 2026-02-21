import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { APP_SCREEN_TO_PATH } from '../app/routeConfig'

const BREAKPOINT_TABLET = 768
const BREAKPOINT_DESKTOP = 1440

const PRIMARY_DESTINATIONS = [
  { key: 'home', label: 'Home', icon: '🏠' },
  { key: 'log', label: 'Log', icon: '📝' },
  { key: 'library', label: 'Library', icon: '📚', isVisible: (flags) => flags.libraryScreenEnabled },
  { key: 'history', label: 'History', icon: '📊' },
  { key: 'analysis', label: 'Analysis', icon: '📈' },
  { key: 'plans', label: 'Plans', icon: '🗓️', isVisible: (flags) => flags.plansEnabled },
]

export const getPrimaryDestinations = (flags) => PRIMARY_DESTINATIONS.filter((destination) => (
  destination.isVisible ? destination.isVisible(flags) : true
))

const getNavigationModeFromWidth = (width) => {
  if (width >= BREAKPOINT_DESKTOP) return 'desktop'
  if (width >= BREAKPOINT_TABLET) return 'tablet'
  return 'phone'
}

export function useNavigationLayoutMode() {
  const [mode, setMode] = useState(() => {
    if (typeof window === 'undefined') return 'phone'
    return getNavigationModeFromWidth(window.innerWidth)
  })

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const updateMode = () => setMode(getNavigationModeFromWidth(window.innerWidth))
    window.addEventListener('resize', updateMode)
    updateMode()
    return () => window.removeEventListener('resize', updateMode)
  }, [])

  return mode
}

function AppNavigation({
  destinations,
  layout,
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const [isOverflowOpen, setIsOverflowOpen] = useState(false)
  const navButtonRefs = useRef([])
  const iconOnly = layout === 'bottom'

  const isPathActive = useCallback((path) => {
    if (!path) return false
    if (path === APP_SCREEN_TO_PATH.home) return location.pathname === path
    return location.pathname === path || location.pathname.startsWith(`${path}/`)
  }, [location.pathname])

  const handleNavigateToPath = useCallback((path) => {
    navigate({ to: path || APP_SCREEN_TO_PATH.home })
    setIsOverflowOpen(false)
  }, [navigate])

  const focusNavButton = (index) => {
    if (!destinations.length) return
    const totalButtons = destinations.length + 1
    const normalized = (index + totalButtons) % totalButtons
    navButtonRefs.current[normalized]?.focus()
  }

  const onNavKeyDown = (event, buttonIndex) => {
    const horizontal = layout !== 'rail'
    const nextKeys = horizontal ? ['ArrowRight'] : ['ArrowDown']
    const previousKeys = horizontal ? ['ArrowLeft'] : ['ArrowUp']

    if (nextKeys.includes(event.key)) {
      event.preventDefault()
      focusNavButton(buttonIndex + 1)
      return
    }

    if (previousKeys.includes(event.key)) {
      event.preventDefault()
      focusNavButton(buttonIndex - 1)
      return
    }

    if (event.key === 'Home') {
      event.preventDefault()
      focusNavButton(0)
      return
    }

    if (event.key === 'End') {
      event.preventDefault()
      focusNavButton(destinations.length)
    }
  }

  const navClasses = [
    `app-navigation app-navigation--${layout}`,
    layout === 'bottom' ? 'app-navigation--bottom' : 'app-navigation--panel',
  ].join(' ')

  return (
    <nav aria-label="Primary" className={navClasses}>
      <div className={`u-nav-stack ${layout === 'rail' ? 'u-nav-stack--column' : 'u-nav-stack--row'}`}>
        {destinations.map((destination, index) => {
          const destinationPath = APP_SCREEN_TO_PATH[destination.key] || APP_SCREEN_TO_PATH.home
          const active = isPathActive(destinationPath)
          return (
            <button
              type="button"
              className={`app-navigation__button ${iconOnly ? 'app-navigation__button--icon-only' : ''}`}
              key={destination.key}
              ref={(node) => { navButtonRefs.current[index] = node }}
              onKeyDown={(event) => onNavKeyDown(event, index)}
              onClick={() => handleNavigateToPath(destinationPath)}
              aria-label={`Go to ${destination.label}`}
              aria-current={active ? 'page' : undefined}
              style={{
                flex: layout === 'bottom' || layout === 'top' ? 1 : 'none',
                minWidth: layout === 'rail' ? 94 : iconOnly ? 44 : 0,
                minHeight: 44,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: layout === 'rail' ? 'flex-start' : 'center',
                gap: 8,
                borderRadius: 12,
                border: `1px solid ${active ? 'var(--accent)' : 'transparent'}`,
                background: active ? 'color-mix(in oklab, var(--accent) 18%, transparent)' : 'transparent',
                color: active ? 'var(--text)' : 'var(--text-muted)',
                fontWeight: active ? 700 : 500,
                padding: layout === 'rail' ? '12px 10px' : '10px 8px',
              }}
            >
              <span aria-hidden="true" style={{ fontSize: 16 }}>{destination.icon}</span>
              {!iconOnly && <span style={{ fontSize: 12, letterSpacing: 0.2 }}>{destination.label}</span>}
            </button>
          )
        })}
        <div className={layout === 'bottom' || layout === 'top' ? 'u-nav-item-grow' : ''} style={{ position: 'relative' }}>
          <button
            className={`app-navigation__button app-navigation__button--overflow ${iconOnly ? 'app-navigation__button--icon-only' : ''}`}
            ref={(node) => { navButtonRefs.current[destinations.length] = node }}
            onKeyDown={(event) => onNavKeyDown(event, destinations.length)}
            onClick={() => setIsOverflowOpen((open) => !open)}
            aria-label="Open secondary menu"
            aria-haspopup="menu"
            aria-controls="secondary-menu"
            aria-expanded={isOverflowOpen}
            style={{
              width: '100%',
              minHeight: 44,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: layout === 'rail' ? 'flex-start' : 'center',
              gap: 8,
              borderRadius: 12,
              border: '1px solid transparent',
              color: 'var(--text-muted)',
              padding: layout === 'rail' ? '12px 10px' : '10px 8px',
            }}
          >
            <span aria-hidden="true" style={{ fontSize: 16 }}>⋯</span>
            {!iconOnly && <span style={{ fontSize: 12 }}>More</span>}
          </button>
          {isOverflowOpen && (
            <div id="secondary-menu" role="menu" style={{
              position: 'absolute',
              right: 0,
              bottom: layout === 'bottom' ? 'calc(100% + 8px)' : 'auto',
              top: layout === 'bottom' ? 'auto' : 'calc(100% + 8px)',
              minWidth: 170,
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'var(--surface2)',
              boxShadow: '0 10px 24px rgba(0,0,0,0.35)',
              padding: 6,
              zIndex: 40,
            }}>
              <button
                type="button"
                className="app-navigation__menu-item"
                role="menuitem"
                onClick={() => handleNavigateToPath(APP_SCREEN_TO_PATH.diagnostics)}
                aria-label="Open diagnostics"
                style={{
                  width: '100%',
                  textAlign: 'left',
                  borderRadius: 8,
                  padding: '10px 12px',
                  color: 'var(--text)',
                  fontSize: 13,
                }}
              >
                🧰 Diagnostics
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}

export default function AppShell({
  children,
  destinations,
  showNavigation,
}) {
  const navigationMode = useNavigationLayoutMode()
  const navigationLayoutByMode = {
    phone: 'bottom',
    tablet: 'rail',
    desktop: 'top',
  }
  const navigationLayout = navigationLayoutByMode[navigationMode] || 'bottom'

  return (
    <div className="app-shell">
      <div className={`page-container app-layout app-layout--${navigationMode} ${showNavigation ? 'app-layout--with-nav' : ''}`}>
        {showNavigation && (
          <div className={`app-nav-slot app-nav-slot--${navigationLayout}`}>
            <AppNavigation
              destinations={destinations}
              layout={navigationLayout}
            />
          </div>
        )}
        <main className={`app-content-slot page-transition ${navigationLayout === 'bottom' && showNavigation ? 'app-content-slot--bottom-nav' : ''}`} aria-label="Primary content">
          {children}
        </main>
      </div>
    </div>
  )
}
