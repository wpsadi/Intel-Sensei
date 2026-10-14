import {
  ArrowUpRightIcon,
  DollarSignIcon,
  DraftingCompassIcon,
  NotebookPenIcon,
  PenToolIcon,
  Settings2Icon,
  SparklesIcon,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { BsBrowserChrome } from 'react-icons/bs'
import { Link } from 'react-router-dom'

import { ThemeToggle } from '@/components/theme-toggle'

type AppIcon = ComponentType<{ className?: string }>

const apps: { name: string; description: string; href: string; icon: AppIcon; tone: string }[] = [
  {
    name: 'Ask Sensei',
    description: 'Think, research, and make progress with your AI copilot.',
    href: '/ask-sensei',
    icon: SparklesIcon,
    tone: 'bg-violet-500/10 text-violet-600 dark:text-violet-300',
  },
  {
    name: 'SNote',
    description: 'Capture ideas, write clearly, and keep everything organized.',
    href: '/s-note',
    icon: NotebookPenIcon,
    tone: 'bg-amber-500/10 text-amber-600 dark:text-amber-300',
  },
  {
    name: 'S-Design',
    description: 'Shape ideas visually on an infinite, flexible canvas.',
    href: '/s-design',
    icon: PenToolIcon,
    tone: 'bg-pink-500/10 text-pink-600 dark:text-pink-300',
  },
  {
    name: 'S3D',
    description: 'Build, edit, and explore 3D scenes in your workspace.',
    href: '/s-3d',
    icon: DraftingCompassIcon,
    tone: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-300',
  },
  {
    name: 'SBrowse',
    description: 'Browse the web and get things done from one focused workspace.',
    href: '/s-browse',
    icon: BsBrowserChrome,
    tone: 'bg-blue-500/10 text-blue-600 dark:text-blue-300',
  },
  {
    name: 'AI usage',
    description: 'See model calls, token usage, and estimated spend.',
    href: '/ai-usage',
    icon: DollarSignIcon,
    tone: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
  },
  {
    name: 'Settings',
    description: 'Configure models, connections, and your workspace.',
    href: '?settings=open',
    icon: Settings2Icon,
    tone: 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
  },
]

function HomePage() {
  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden bg-muted/30">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,oklch(0.78_0.12_280_/_0.14),transparent_34%),radial-gradient(circle_at_bottom_left,oklch(0.78_0.1_190_/_0.1),transparent_36%)]" />
      <header className="relative flex h-16 items-center justify-between border-b bg-background/70 px-6 backdrop-blur sm:px-10">
        <Link to="/" className="flex items-center gap-2.5 font-semibold tracking-tight" aria-label="Sensei home">
          <span className="flex size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <SparklesIcon className="size-4" />
          </span>
          <span>Sensei</span>
        </Link>
        <ThemeToggle />
      </header>

      <main className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-12 sm:px-10 sm:py-16">
        <div className="mb-10 max-w-xl">
          <p className="mb-3 text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">Your workspace</p>
          <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">What would you like to work on?</h1>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">Pick an app to jump straight in.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map(({ name, description, href, icon: Icon, tone }) => (
            <Link
              key={name}
              to={href}
              className="group flex min-h-44 flex-col justify-between rounded-2xl border bg-background/85 p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <div className="flex items-start justify-between gap-4">
                <span className={`flex size-11 items-center justify-center rounded-xl ${tone}`}>
                  <Icon className="size-5" />
                </span>
                <ArrowUpRightIcon className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              <div className="mt-8">
                <h2 className="font-heading text-lg font-semibold tracking-tight">{name}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  )
}

export default HomePage
