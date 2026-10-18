import { type ReactNode, type RefObject, createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

interface Aurora {
  el: RefObject<HTMLDivElement | null>
  setActive: (active: boolean) => void
}

const AuroraContext = createContext<Aurora | null>(null)

/**
 * Wraps a widget panel and, while a live call runs in it, glows along its borders and breathes with Sensei's voice.
 * The glow stays inside the panel's own shape; nothing is drawn over the rest of the page.
 */
export function LiveAurora({
  as: Tag = 'div',
  className,
  children,
  'aria-label': label,
}: {
  as?: 'div' | 'section'
  className?: string
  children: ReactNode
  'aria-label'?: string
}) {
  const el = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(false)
  const value = useMemo(() => ({ el, setActive }), [])
  return (
    <AuroraContext.Provider value={value}>
      <Tag ref={el} aria-label={label} data-live={active} className={cn('relative [--live-level:0]', className)}>
        {children}
        <span
          aria-hidden
          data-live-aurora
          className="pointer-events-none absolute inset-0 z-20 rounded-[inherit] transition-opacity duration-500"
          style={{
            opacity: active ? 1 : 0,
            border: '1.5px solid rgb(96 165 250 / calc(.45 + .5 * var(--live-level)))',
            boxShadow: 'inset 0 0 calc(14px + 44px * var(--live-level)) rgb(59 130 246 / calc(.25 + .5 * var(--live-level)))',
            background:
              'radial-gradient(ellipse 85% 40% at 50% 112%, rgb(59 130 246 / calc(.1 + .35 * var(--live-level))), transparent 70%)',
          }}
        />
      </Tag>
    </AuroraContext.Provider>
  )
}

/**
 * Called by the composer: while `active`, lights the nearest `LiveAurora` and feeds it how loud Sensei's voice is. The
 * level rides on a CSS variable of that panel, so React does not re-render 60 times a second.
 */
export function useLiveAuroraDrive(active: boolean, level: () => number) {
  const aurora = useContext(AuroraContext)
  useEffect(() => {
    if (!aurora || !active) return
    const panel = aurora.el.current
    aurora.setActive(true)
    let smooth = 0
    let frame = requestAnimationFrame(function tick() {
      // Rise fast, fall slowly, so the glow breathes instead of flickering.
      const volume = level()
      smooth = volume > smooth ? volume : smooth * 0.9 + volume * 0.1
      panel?.style.setProperty('--live-level', smooth.toFixed(3))
      frame = requestAnimationFrame(tick)
    })
    return () => {
      cancelAnimationFrame(frame)
      aurora.setActive(false)
      panel?.style.removeProperty('--live-level')
    }
  }, [aurora, active, level])
}
