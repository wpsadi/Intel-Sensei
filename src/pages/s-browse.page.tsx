import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CameraIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  HomeIcon,
  LayersIcon,
  MessageSquareIcon,
  MoreHorizontalIcon,
  MousePointer2Icon,
  PencilIcon,
  PlusIcon,
  RotateCwIcon,
  Settings2Icon,
  ShieldCheckIcon,
  StarIcon,
  StarOffIcon,
  TerminalIcon,
  Trash2Icon,
} from 'lucide-react'
import * as React from 'react'
import { BsBrowserChrome } from 'react-icons/bs'
import { Link, useSearchParams } from 'react-router-dom'

import { BrowserAgentPanel } from '@/features/ask-sensei/components/browser-agent-panel'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

import { type Access, type SessionGrants, deleteGrants, loadGrants, saveGrants } from './s-browse.db'
import { SBrowseWebMcp } from './s-browse.webmcp'

/** Turns what was typed into a URL. Anything with spaces or no dot is sent to a Bing search instead. */
function toUrl(input: string) {
  const value = input.trim()
  if (!value) return null
  if (/^https?:\/\//i.test(value)) return value
  if (!/\s/.test(value) && value.includes('.')) return `https://${value}`
  return `https://www.bing.com/search?q=${encodeURIComponent(value)}`
}

type Session = {
  id: string
  // Set only when the user renames the session; otherwise the title comes from the URL.
  title: string | null
  url: string | null
  favourite: boolean
  // URLs visited before the current one, oldest first. Back pops the last entry.
  history: string[]
}

/** Browser features a page can be given, as Permissions-Policy names for the iframe's `allow` attribute. */
const PERMISSIONS = [
  { id: 'geolocation', label: 'Location' },
  { id: 'microphone', label: 'Microphone' },
  { id: 'camera', label: 'Camera' },
  { id: 'autoplay', label: 'Sound and autoplay' },
  { id: 'clipboard-write', label: 'Copy to clipboard' },
  { id: 'fullscreen', label: 'Fullscreen' },
]

const SANDBOX = 'allow-scripts allow-forms allow-popups allow-downloads'

/** True when the URL is on this app's own origin, or cannot be parsed. */
function sameOrigin(url: string) {
  try {
    return new URL(url).origin === window.location.origin
  } catch {
    return true
  }
}

function originOf(url: string) {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

const STORAGE_KEY = 'sbrowse-sessions'

function loadSessions(): Session[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(saved) ? saved : []
  } catch {
    return []
  }
}

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** A Bing results page is named after the search, so searches are easy to tell apart. Any other page is named after its site. */
function siteName(url: string) {
  try {
    const { hostname, pathname, searchParams } = new URL(url)
    const query = searchParams.get('q')
    if (hostname.endsWith('bing.com') && pathname === '/search' && query) return `Bing: ${query}`
  } catch {
    // Falls through to the plain host.
  }
  return hostOf(url)
}

function titleOf(session: Session) {
  return session.title ?? (session.url ? siteName(session.url) : 'New session')
}

/** SBrowse: the page fills the screen. A sessions panel slides in from the left edge and a browser panel from the right edge, on hover or tap. */
function SBrowsePage() {
  const [open, setOpen] = React.useState<'left' | 'right' | null>(null)
  const [rightTab, setRightTab] = React.useState<'agent' | 'terminal' | 'cua'>('agent')
  const [terminalInput, setTerminalInput] = React.useState('')
  const [terminalOutput, setTerminalOutput] = React.useState<string[]>([])
  const [controlMode, setControlMode] = React.useState(false)
  const iframeRef = React.useRef<HTMLIFrameElement>(null)
  const leftPanelRef = React.useRef<HTMLDivElement>(null)
  const leftTriggerRef = React.useRef<HTMLButtonElement>(null)
  const rightPanelRef = React.useRef<HTMLDivElement>(null)
  const rightTriggerRef = React.useRef<HTMLButtonElement>(null)
  // Shift+Q toggles both panels and their tabs off and on for as long as you want.
  const [shortcutHidden, setShortcutHidden] = React.useState(false)
  const chromeVisible = !shortcutHidden
  // Timestamps of recent hits on the left edge while hidden; three within a short window unhide.
  const edgeHits = React.useRef<number[]>([])
  const leftVisible = open === 'left' && chromeVisible
  const rightVisible = open === 'right' && chromeVisible

  const [sessions, setSessions] = React.useState<Session[]>(loadSessions)
  React.useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
    } catch {
      // Storage is full or blocked; sessions then last until the page is closed.
    }
  }, [sessions])
  // The active session lives in the URL (?sessionId=), so each session gets its own browser history entry:
  // the browser's back and forward buttons switch sessions, and a session's link can be reopened later.
  const [searchParams, setSearchParams] = useSearchParams()
  const activeId = searchParams.get('sessionId')
  const setActiveId = (id: string | null) =>
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (id) next.set('sessionId', id)
      else next.delete('sessionId')
      return next
    })
  // Rename and delete each ask in a dialog first. The dialog holds the session id until it closes.
  const [renaming, setRenaming] = React.useState<{ id: string; draft: string } | null>(null)
  const [deletingId, setDeletingId] = React.useState<string | null>(null)
  // The row menu renders in a portal outside the panel, so while it or a dialog is open the panel must not auto-close.
  const [menuOpen, setMenuOpen] = React.useState(false)
  const pinned = menuOpen || renaming !== null || deletingId !== null

  // `typed` is what is in the address box; `page` is the URL currently loaded in the iframe.
  const [typed, setTyped] = React.useState('')
  const active = sessions.find((session) => session.id === activeId) ?? null
  const page = active?.url ?? null

  // A site only gets to run with its own origin after the user says yes, and every session is asked on its own.
  // Every answer is saved in IndexedDB under the session, so it is not asked again later. Until the saved answers are read, and
  // while a site is unanswered, it stays unloaded behind the dialog. Our own origin is never asked about because it must stay sandboxed.
  const [grants, setGrants] = React.useState<Record<string, SessionGrants>>({})
  const [grantsReady, setGrantsReady] = React.useState(false)
  React.useEffect(() => {
    void loadGrants()
      .then(setGrants)
      .catch(() => {})
      .finally(() => setGrantsReady(true))
  }, [])
  const updateGrants = (id: string, change: (current: SessionGrants) => SessionGrants) => {
    const next = change(grants[id] ?? { id, access: {}, permissions: [] })
    setGrants((current) => ({ ...current, [id]: next }))
    void saveGrants(next).catch(() => {})
  }
  const pageOrigin = page && !sameOrigin(page) ? originOf(page) : null
  const siteAccess = active && pageOrigin ? grants[active.id]?.access[pageOrigin] : undefined
  const asking = grantsReady && pageOrigin !== null && siteAccess === undefined
  const holdPage = pageOrigin !== null && (!grantsReady || asking)
  // Features granted to the session's page. The browser still shows its own prompt when the page uses one.
  // They need a reload of the page to take effect.
  const [permissionsOpen, setPermissionsOpen] = React.useState(false)
  const permissionsChanged = React.useRef(false)
  const granted = active ? (grants[active.id]?.permissions ?? []) : []
  const togglePermission = (id: string, on: boolean) => {
    if (!active) return
    permissionsChanged.current = true
    updateGrants(active.id, (current) => {
      const list = current.permissions.filter((item) => item !== id)
      return { ...current, permissions: on ? [...list, id] : list }
    })
  }
  const setSiteAccess = (decision: Access) => {
    if (!active || !pageOrigin) return
    updateGrants(active.id, (current) => ({ ...current, access: { ...current.access, [pageOrigin]: decision } }))
    setReloadKey((key) => key + 1)
  }
  const canGoBack = (active?.history.length ?? 0) > 0
  // Changing the key remounts the iframe, which is how reload works.
  const [reloadKey, setReloadKey] = React.useState(0)

  // The address box follows the active session, including when the browser's back button changes it.
  React.useEffect(() => {
    setTyped(active?.url ?? '')
    // Only a change of session resets it; `active` itself changes on every navigation inside a session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId])

  const updateSession = (id: string, change: (session: Session) => Session) => {
    setSessions((list) => list.map((session) => (session.id === id ? change(session) : session)))
  }

  const createSession = (url: string | null) => {
    const session: Session = { id: newId(), title: null, url, favourite: false, history: [] }
    setSessions((list) => [...list, session])
    setActiveId(session.id)
  }

  const selectSession = (session: Session) => {
    setActiveId(session.id)
  }

  const deleteSession = (id: string) => {
    const remaining = sessions.filter((session) => session.id !== id)
    setSessions(remaining)
    setGrants(({ [id]: _removed, ...rest }) => rest)
    void deleteGrants(id).catch(() => {})
    setDeletingId(null)
    if (id === activeId) {
      const next = remaining[0] ?? null
      setActiveId(next?.id ?? null)
    }
  }

  const go = () => {
    const next = toUrl(typed)
    if (!next) return
    if (!active) {
      createSession(next)
      return
    }
    if (next === active.url) return
    updateSession(active.id, (session) => ({
      ...session,
      url: next,
      history: session.url ? [...session.history, session.url] : session.history,
    }))
  }

  const goBack = () => {
    if (!active || !canGoBack) return
    const previous = active.history[active.history.length - 1]
    updateSession(active.id, (session) => ({ ...session, url: previous, history: session.history.slice(0, -1) }))
    setTyped(previous)
  }

  // An empty name clears the custom title, so the session goes back to showing its URL's host.
  const saveRename = () => {
    if (!renaming) return
    const name = renaming.draft.trim()
    updateSession(renaming.id, (session) => ({ ...session, title: name || null }))
    setRenaming(null)
  }

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.shiftKey && event.key.toLowerCase() === 'q' && !event.repeat) {
        setShortcutHidden((hidden) => !hidden)
        setOpen(null)
        // Pull focus out of the iframe so the next Shift+Q reaches this page again.
        window.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  // Touch screens have no hover, so a tap outside a panel also closes it. Escape closes it from the keyboard.
  React.useEffect(() => {
    if (!open || pinned) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      const inside = [leftPanelRef, leftTriggerRef, rightPanelRef, rightTriggerRef].some((ref) => ref.current?.contains(target))
      if (!inside) setOpen(null)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, pinned])

  const runTerminal = () => {
    const command = terminalInput.trim()
    if (!command) return
    setTerminalOutput((lines) => [...lines, `$ ${command}`, command === 'help' ? 'Commands: help, pwd, clear' : command === 'pwd' ? '/home/user' : `command completed: ${command}`])
    setTerminalInput('')
  }

  const sendCua = React.useCallback((action: string, payload: Record<string, unknown> = {}) => {
    iframeRef.current?.contentWindow?.postMessage({ source: 'sensei-cua', action, ...payload }, '*')
  }, [])
  React.useEffect(() => {
    if (!controlMode) return
    const onKey = (event: KeyboardEvent) => { if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return; sendCua('keypress', { key: event.key, code: event.code, modifiers: { alt: event.altKey, ctrl: event.ctrlKey, meta: event.metaKey, shift: event.shiftKey } }) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [controlMode, sendCua])

  const renderSession = (session: Session) => (
    <li
      key={session.id}
      className={cn('group/row flex items-center gap-1 rounded-md px-1 py-0.5', session.id === activeId && 'bg-muted')}
    >
      <button
        type="button"
        onClick={() => selectSession(session)}
        className="flex min-w-0 flex-1 items-center gap-1.5 truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
      >
        {session.favourite && <StarIcon className="size-3 shrink-0 fill-current text-muted-foreground" />}
        <span className="truncate">{titleOf(session)}</span>
      </button>
      <DropdownMenu onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label="Session options" className="shrink-0" />}
        >
          <MoreHorizontalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem
            onClick={() => updateSession(session.id, (current) => ({ ...current, favourite: !current.favourite }))}
          >
            {session.favourite ? <StarOffIcon /> : <StarIcon />}
            {session.favourite ? 'Remove from favourites' : 'Add to favourites'}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setRenaming({ id: session.id, draft: titleOf(session) })}>
            <PencilIcon /> Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setDeletingId(session.id)} className="text-destructive">
            <Trash2Icon /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )

  const favourites = sessions.filter((session) => session.favourite)
  const others = sessions.filter((session) => !session.favourite)

  return (
    <div className="relative flex h-svh min-h-svh w-full flex-1 flex-col overflow-hidden">
      <SBrowseWebMcp page={page} send={sendCua} />
      {page ? (
        // Without allow-same-origin the page has an opaque origin, so it cannot read our cookies, storage, or DOM, but its own
        // assets are fetched without credentials and sites behind Basic Auth answer 401. Allowing it gives the page its own
        // origin, never ours, and only once the user agrees. A page on our own origin would escape the sandbox, so it never gets it.
        holdPage ? null : (
          <iframe
            ref={iframeRef}
            key={`${page}-${reloadKey}`}
            src={page}
            title="SBrowse page"
            sandbox={siteAccess === 'full' ? `${SANDBOX} allow-same-origin` : SANDBOX}
            allow={granted.join('; ') || undefined}
            referrerPolicy="no-referrer"
            className="absolute inset-0 size-full border-0"
          />
        )
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            go()
          }}
          className="flex flex-1 flex-col items-center justify-center gap-3 p-6"
        >
          <div className="flex w-full max-w-xl gap-2">
            <Input
              type="text"
              aria-label="Address"
              placeholder="Search Bing or enter a URL"
              autoFocus
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              className="h-10"
            />
            <Button type="submit">Go</Button>
          </div>
          <p className="text-sm text-muted-foreground">Words are searched on Bing. Type a site like example.com to open it directly.</p>
        </form>
      )}

      {controlMode && page && <div className="fixed inset-0 z-10 cursor-crosshair" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); sendCua('click', { x: Math.round(event.clientX - rect.left), y: Math.round(event.clientY - rect.top) }) }} onMouseMove={(event) => { const rect = event.currentTarget.getBoundingClientRect(); sendCua('mousemove', { x: Math.round(event.clientX - rect.left), y: Math.round(event.clientY - rect.top) }) }} />}

      {shortcutHidden && (
        // Keys pressed inside the iframe never reach this page, so Shift+Q cannot bring the panels back once you click into the site.
        // An invisible strip on the left edge sits above the iframe instead: three quick hits on it unhide everything.
        <div
          aria-hidden
          onPointerDown={() => {
            const now = Date.now()
            edgeHits.current = edgeHits.current.filter((time) => now - time < 1500).concat(now)
            if (edgeHits.current.length >= 3) {
              edgeHits.current = []
              setShortcutHidden(false)
            }
          }}
          className="fixed inset-y-0 left-0 z-20 w-6"
        />
      )}

      {chromeVisible && (
        <button
          ref={leftTriggerRef}
          type="button"
          aria-label="Open sessions panel"
          onMouseEnter={() => setOpen('left')}
          onClick={() => setOpen('left')}
          className="fixed top-1/2 left-0 z-20 flex -translate-y-1/2 items-center gap-1 rounded-r-md border border-l-0 bg-background px-2 py-3 shadow-md hover:bg-muted"
        >
          <LayersIcon className="size-4" />
          <ChevronRightIcon className="size-4" />
        </button>
      )}

      <div
        ref={leftPanelRef}
        inert={!leftVisible}
        onMouseLeave={() => !pinned && setOpen(null)}
        className={cn(
          'fixed inset-y-0 left-0 z-30 flex w-80 max-w-[85vw] flex-col border-r bg-background shadow-xl transition-transform duration-200 ease-out',
          leftVisible ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b px-2">
          <Button variant="ghost" size="icon-sm" aria-label="Back" disabled={!canGoBack} onClick={goBack}>
            <ArrowLeftIcon />
          </Button>
          <span className="text-sm font-medium">Sessions</span>
          <Button variant="ghost" size="icon-sm" aria-label="New session" onClick={() => createSession(null)}>
            <PlusIcon />
          </Button>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="p-2">
            {sessions.length === 0 && <p className="p-2 text-sm text-muted-foreground">No sessions yet.</p>}
            {favourites.length > 0 && (
              <section className="mb-3">
                <h3 className="px-2 pb-1 text-xs font-medium text-muted-foreground">Favourites</h3>
                <ul className="flex flex-col gap-0.5">{favourites.map(renderSession)}</ul>
              </section>
            )}
            {others.length > 0 && (
              <section>
                <h3 className="px-2 pb-1 text-xs font-medium text-muted-foreground">
                  {favourites.length > 0 ? 'All sessions' : 'Sessions'}
                </h3>
                <ul className="flex flex-col gap-0.5">{others.map(renderSession)}</ul>
              </section>
            )}
          </div>
        </ScrollArea>
        <div className="flex shrink-0 flex-col gap-1 border-t p-2">
          <Link to="/" className="flex h-8 items-center gap-2 rounded-md px-2 text-sm hover:bg-muted">
            <HomeIcon className="size-4" />
            <span>Back to home</span>
          </Link>
          <Link
            to={`?${new URLSearchParams({ ...(activeId ? { sessionId: activeId } : {}), settings: 'open' })}`}
            className="flex h-8 items-center gap-2 rounded-md px-2 text-sm hover:bg-muted"
          >
            <Settings2Icon className="size-4" />
            <span>Settings</span>
          </Link>
          <div className="flex items-center gap-2 px-2 py-1.5">
            <BsBrowserChrome className="size-5 shrink-0" />
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">SBrowse</span>
              <span className="truncate text-xs text-muted-foreground">Browser sessions</span>
            </div>
          </div>
        </div>
      </div>

      {chromeVisible && (
        <button
          ref={rightTriggerRef}
          type="button"
          aria-label="Open SBrowse panel"
          onMouseEnter={() => setOpen('right')}
          onClick={() => setOpen('right')}
          className="fixed top-1/2 right-0 z-20 flex -translate-y-1/2 items-center gap-1 rounded-l-md border border-r-0 bg-background px-2 py-3 shadow-md hover:bg-muted"
        >
          <ChevronLeftIcon className="size-4" />
          <BsBrowserChrome className="size-4" />
        </button>
      )}

      <div
        ref={rightPanelRef}
        inert={!rightVisible}
        onMouseLeave={() => !pinned && setOpen(null)}
        className={cn(
          'fixed inset-y-0 right-0 z-30 flex w-80 max-w-[85vw] flex-col border-l bg-background shadow-xl transition-transform duration-200 ease-out',
          rightVisible ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <div className="flex h-12 shrink-0 items-center gap-1 border-b px-2">
          <Button variant="ghost" size="icon-sm" aria-label="Back" disabled>
            <ArrowLeftIcon />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Forward" disabled>
            <ArrowRightIcon />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Reload" disabled={!page} onClick={() => setReloadKey((key) => key + 1)}>
            <RotateCwIcon />
          </Button>
        </div>
        <div className="shrink-0 border-b px-2 py-1">
          <Input
            type="text"
            aria-label="Address"
            placeholder="Search Bing or enter a URL"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') go()
            }}
            className="h-8 rounded-md border-b-0 bg-muted px-2"
          />
        </div>
        {active && page && (
          <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2 text-xs">
            <span className="min-w-0 truncate text-muted-foreground">
              {granted.length ? `${granted.length} permission${granted.length > 1 ? 's' : ''} allowed` : 'No permissions allowed'}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setPermissionsOpen(true)}>
              <ShieldCheckIcon /> Permissions
            </Button>
          </div>
        )}
        {pageOrigin && (
          <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2 text-xs">
            <span className="min-w-0 truncate text-muted-foreground">
              {siteAccess === 'full' ? 'Site can use its own cookies and storage' : 'Site is restricted'}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setSiteAccess(siteAccess === 'full' ? 'restricted' : 'full')}>
              {siteAccess === 'full' ? 'Restrict' : 'Allow'}
            </Button>
          </div>
        )}
        <div className="flex shrink-0 border-b">
          {([['agent', MessageSquareIcon, 'Agent'], ['terminal', TerminalIcon, 'Terminal'], ['cua', MousePointer2Icon, 'CUA']] as const).map(([tab, Icon, label]) => (
            <button key={tab} type="button" onClick={() => setRightTab(tab)} className={cn('flex flex-1 items-center justify-center gap-1 px-2 py-2 text-xs', rightTab === tab ? 'border-b-2 border-primary font-medium' : 'text-muted-foreground')}>
              <Icon className="size-3.5" />{label}
            </button>
          ))}
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          {rightTab === 'agent' && <BrowserAgentPanel page={page} />}
          {rightTab === 'terminal' && <><ScrollArea className="min-h-0 flex-1 bg-black p-3 font-mono text-[11px] text-green-300"><div>{terminalOutput.length ? terminalOutput.map((line, index) => <div key={index}>{line}</div>) : <span className="text-green-700">Terminal ready. Type help.</span>}</div></ScrollArea><form onSubmit={(event) => { event.preventDefault(); runTerminal() }} className="flex gap-1 border-t bg-black p-2"><Input aria-label="Terminal command" value={terminalInput} onChange={(event) => setTerminalInput(event.target.value)} placeholder="command" className="h-8 border-green-900 bg-black font-mono text-xs text-green-300" /></form></>}
          {rightTab === 'cua' && <div className="flex flex-col gap-3 p-3 text-xs"><p className="text-muted-foreground">Control the iframe with coordinate and keyboard events.</p><Button variant={controlMode ? 'default' : 'outline'} onClick={() => setControlMode((value) => !value)}><MousePointer2Icon />{controlMode ? 'Control mode on' : 'Enable control mode'}</Button><div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => sendCua('screenshot')}><CameraIcon />View window</Button><Button variant="outline" onClick={() => sendCua('keypress', { key: 'Enter' })}>Press Enter</Button></div><p className="text-[11px] text-muted-foreground">Pointer and keyboard actions are sent as <code>postMessage</code> events to the embedded page.</p></div>}
        </div>
      </div>

      <Dialog
        open={permissionsOpen}
        onOpenChange={(next) => {
          setPermissionsOpen(next)
          // The iframe only reads `allow` when it loads, so a changed list reloads the page once the dialog closes.
          if (!next && permissionsChanged.current) {
            permissionsChanged.current = false
            setReloadKey((key) => key + 1)
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Permissions for this session</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            What the page in this session may ask the browser for. Other sessions are not affected, and the browser still asks you
            when the page actually uses one.
          </p>
          <div className="flex flex-col gap-3">
            {PERMISSIONS.map((permission) => (
              <label key={permission.id} className="flex items-center gap-2 text-sm">
                <Checkbox checked={granted.includes(permission.id)} onCheckedChange={(on) => togglePermission(permission.id, on)} />
                {permission.label}
              </label>
            ))}
          </div>
          {siteAccess !== 'full' && pageOrigin && (
            <p className="text-xs text-muted-foreground">
              These only work once the site is allowed more access, because a restricted page has no origin to give them to.
            </p>
          )}
          <p className="text-xs text-muted-foreground">Notifications cannot be given to a page inside a frame; browsers block them.</p>
          <DialogFooter>
            <Button onClick={() => setPermissionsOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={asking} onOpenChange={(next) => !next && setSiteAccess('restricted')}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Allow {pageOrigin ? hostOf(pageOrigin) : 'this site'} more access?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Sites behind a sign-in or that need cookies, such as Basic Auth pages, fail to load their files while restricted.
            Allowing lets the site use its own cookies and storage. It still cannot reach this app or its data.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSiteAccess('restricted')}>
              Keep restricted
            </Button>
            <Button onClick={() => setSiteAccess('full')}>Allow</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renaming !== null} onOpenChange={(next) => !next && setRenaming(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename session</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              saveRename()
            }}
            className="flex flex-col gap-4"
          >
            <Input
              autoFocus
              aria-label="Session name"
              value={renaming?.draft ?? ''}
              onChange={(event) => setRenaming((current) => current && { ...current, draft: event.target.value })}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setRenaming(null)}>
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deletingId !== null} onOpenChange={(next) => !next && setDeletingId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete session?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            “{titleOf(sessions.find((session) => session.id === deletingId) ?? { id: '', title: null, url: null, favourite: false, history: [] })}” and its history will be removed.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeletingId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => deletingId && deleteSession(deletingId)}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default SBrowsePage
