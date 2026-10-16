import * as React from 'react'

const MOBILE_BREAKPOINT = 768

const subscribe = (onChange: () => void) => {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

const getSnapshot = () => window.innerWidth < MOBILE_BREAKPOINT

/** The same check as `useIsMobile`, for code that runs outside React (editor extensions, event handlers). */
export const isMobileViewport = getSnapshot

const getServerSnapshot = () => false

export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
