'use client'

import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react'
import { useTheme } from 'next-themes'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

const themeCycle = ['system', 'light', 'dark'] as const

const themeMeta = {
  system: { label: 'System', icon: MonitorIcon },
  light: { label: 'Light', icon: SunIcon },
  dark: { label: 'Dark', icon: MoonIcon },
} as const

export function ThemeToggle() {
  const { theme = 'system', setTheme } = useTheme()
  const current = (themeCycle as readonly string[]).includes(theme) ? (theme as (typeof themeCycle)[number]) : 'system'
  const { label, icon: Icon } = themeMeta[current]

  function cycleTheme() {
    const next = themeCycle[(themeCycle.indexOf(current) + 1) % themeCycle.length]
    setTheme(next)
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button variant="ghost" size="icon-sm" aria-label={`Theme: ${label}`} onClick={cycleTheme}>
              <Icon />
            </Button>
          }
        />
        <TooltipContent>Theme: {label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
