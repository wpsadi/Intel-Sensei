import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react'
import { useTheme } from 'next-themes'

import { Button } from '@/components/ui/button'

const THEMES = [
  { value: 'system', label: 'System', icon: MonitorIcon },
  { value: 'light', label: 'Light', icon: SunIcon },
  { value: 'dark', label: 'Dark', icon: MoonIcon },
] as const

export function AppearanceSection() {
  const { theme = 'system', setTheme } = useTheme()

  return (
    <div className="flex flex-col gap-3 text-sm">
      <h3 className="font-medium">Theme</h3>
      <div className="grid grid-cols-3 gap-2">
        {THEMES.map(({ value, label, icon: Icon }) => (
          <Button
            key={value}
            variant={theme === value ? 'default' : 'outline'}
            onClick={() => setTheme(value)}
            aria-pressed={theme === value}
          >
            <Icon />
            {label}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">System follows your device's light or dark setting.</p>
    </div>
  )
}
