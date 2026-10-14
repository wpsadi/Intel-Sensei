import { PlusIcon, RotateCcwIcon, XIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { type SandboxStatus, resetSandbox, sandboxStatus, warmSandbox } from '@/ai/sandbox/client'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { useTerminalRunning } from './command-activity'
import { RunningSpinner } from './running-spinner'
import { MAX_TERMINALS, useTerminals } from './terminal.store'
import { XtermView } from './xterm-view'

const STATUS: Record<SandboxStatus, { label: string; dot: string }> = {
  idle: { label: 'Stopped: starts when used', dot: 'bg-zinc-500' },
  booting: { label: 'Booting up the environment…', dot: 'bg-amber-400 animate-pulse' },
  ready: { label: 'Ready', dot: 'bg-emerald-500' },
  unavailable: { label: 'Not available at the moment', dot: 'bg-red-500' },
}

/** A terminal's tab: its name, and a spinner while a command runs in it. */
function TabLabel({ chatId, terminalId, title }: { chatId: string; terminalId: string; title: string }) {
  const running = useTerminalRunning(chatId, terminalId)
  return (
    <>
      {running && <RunningSpinner className="size-3" />}
      <span className="truncate">{title}</span>
    </>
  )
}

/** The environment's state for a chat, checked a few times a second while the panel is open. */
function useSandboxStatus(chatId: string) {
  const [status, setStatus] = useState<SandboxStatus>(() => sandboxStatus(chatId))
  useEffect(() => {
    const tick = () => setStatus(sandboxStatus(chatId))
    tick()
    const timer = window.setInterval(tick, 700)
    return () => window.clearInterval(timer)
  }, [chatId])
  return status
}

/**
 * The terminals of the open chat, under the conversation. Each chat has its own environment (files and commands), kept
 * across reloads, and any number of screens onto it.
 */
export function TerminalPanel({ chatId, onClose }: { chatId: string; onClose: () => void }) {
  const { sessions, active, height, load, setActive, addTerminal, closeTerminal, setHeight } = useTerminals()
  const [loaded, setLoaded] = useState(false)
  const status = useSandboxStatus(chatId)
  const drag = useRef<{ y: number; height: number } | null>(null)

  useEffect(() => {
    // The panel is keyed by chat, so it starts unloaded for each one.
    let current = true
    void load(chatId).then(() => current && setLoaded(true))
    // Opening a chat's terminal always gets its environment going, if it is not already.
    warmSandbox(chatId)
    return () => void (current = false)
  }, [chatId, load])

  const session = sessions[chatId]
  const activeId = active[chatId] ?? 'agent'

  return (
    <section aria-label="Terminal" className="relative flex shrink-0 flex-col border-t bg-zinc-100 text-zinc-800 dark:bg-[#161616] dark:text-zinc-200" style={{ height }}>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize terminal"
        className="absolute inset-x-0 -top-1 z-10 h-2 cursor-row-resize"
        onPointerDown={(event) => {
          drag.current = { y: event.clientY, height }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          if (!drag.current) return
          setHeight(Math.max(140, Math.min(window.innerHeight * 0.75, drag.current.height + drag.current.y - event.clientY)))
        }}
        onPointerUp={() => void (drag.current = null)}
      />
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-black/10 dark:border-white/10 px-2">
        {session?.terminals.map((tab) => (
          <div
            key={tab.id}
            className={cn(
              'group flex h-7 items-center gap-1 rounded-md px-2 text-xs',
              tab.id === activeId ? 'bg-black/10 text-black dark:bg-white/10 dark:text-white' : 'text-zinc-500 hover:bg-black/5 dark:text-zinc-400 dark:hover:bg-white/5',
            )}
          >
            <button type="button" className="flex items-center gap-1.5 truncate" onClick={() => setActive(chatId, tab.id)}>
              <TabLabel chatId={chatId} terminalId={tab.id} title={tab.title} />
            </button>
            {tab.id !== 'agent' && (
              <button
                type="button"
                aria-label={`Close ${tab.title}`}
                className="rounded p-0.5 opacity-60 hover:bg-black/10 hover:opacity-100 dark:hover:bg-white/10"
                onClick={() => closeTerminal(chatId, tab.id)}
              >
                <XIcon className="size-3" />
              </button>
            )}
          </div>
        ))}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="New terminal"
          className="size-7 text-zinc-500 hover:bg-black/10 hover:text-black dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"
          disabled={(session?.terminals.length ?? 0) >= MAX_TERMINALS}
          onClick={() => addTerminal(chatId)}
        >
          <PlusIcon />
        </Button>
        <div className="ml-auto flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <span className="flex items-center gap-1.5">
            <span className={cn('size-2 rounded-full', STATUS[status].dot)} />
            {STATUS[status].label}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Restart environment"
            title="Restart the environment and replay this chat's commands"
            className="size-7 text-zinc-500 hover:bg-black/10 hover:text-black dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"
            onClick={() => resetSandbox(chatId)}
          >
            <RotateCcwIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close terminal"
            className="size-7 text-zinc-500 hover:bg-black/10 hover:text-black dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"
            onClick={onClose}
          >
            <XIcon />
          </Button>
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        {loaded &&
          session?.terminals.map((tab) => (
            <div key={tab.id} className={cn('absolute inset-0', tab.id !== activeId && 'invisible')}>
              <XtermView chatId={chatId} terminalId={tab.id} active={tab.id === activeId} />
            </div>
          ))}
      </div>
    </section>
  )
}
