import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'

import '@xterm/xterm/css/xterm.css'
import { useTheme } from 'next-themes'
import { useEffect, useRef } from 'react'

import { type SandboxOp, onSandboxEvent, runShellCommand, sandboxStatus } from '@/ai/sandbox/client'
import { copyText } from '@/lib/clipboard'

import { LineEditor, shellPrompt } from './line-editor'
import { useTerminals } from './terminal.store'

// A soft dark grey in the dark theme (not pure black), a light grey in the light one.
const THEMES = {
  dark: { background: '#161616', foreground: '#d4d4d8', cursor: '#d4d4d8', selectionBackground: '#3f3f46' },
  light: {
    background: '#f4f4f5',
    foreground: '#27272a',
    cursor: '#27272a',
    selectionBackground: '#d4d4d8',
    // The default bright colors vanish on a light background.
    brightBlack: '#71717a',
    yellow: '#a16207',
    brightYellow: '#a16207',
    green: '#15803d',
    brightGreen: '#15803d',
    cyan: '#0e7490',
    brightCyan: '#0e7490',
    white: '#52525b',
    brightWhite: '#27272a',
  },
}

const dim = (text: string) => `\x1b[2m${text}\x1b[0m`

/** A command or file write as it looks on screen. Sensei's own steps carry a tag so they are told apart from typing. */
function writeOp(term: Terminal, op: SandboxOp, prompt: string, withOutput = true) {
  const tag = op.source === 'ai' ? ` ${dim('(Sensei)')}` : ''
  if (op.kind === 'write') return term.write(`${dim(`[${op.append ? 'appended to' : 'wrote'} ${op.path}]`)}${tag}\r\n`)
  term.write(`${prompt}${op.command}${tag}\r\n`)
  if (withOutput && op.output) term.write(op.output.endsWith('\n') ? op.output : `${op.output}\n`)
}

/**
 * One terminal screen of a chat. It shows what was run in this terminal before (so a reload looks the same), takes
 * typed commands and runs them in the chat's own environment, and shows what Sensei runs there as it happens.
 */
export function XtermView({ chatId, terminalId, active }: { chatId: string; terminalId: string; active: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const { resolvedTheme } = useTheme()
  const themeRef = useRef(resolvedTheme)
  themeRef.current = resolvedTheme

  // Switching the app theme repaints a terminal that is already open.
  useEffect(() => {
    if (termRef.current) termRef.current.options.theme = THEMES[resolvedTheme === 'light' ? 'light' : 'dark']
  }, [resolvedTheme])

  useEffect(() => {
    const element = host.current
    if (!element) return
    const term = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontSize: 12,
      scrollback: 5000,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      theme: THEMES[themeRef.current === 'light' ? 'light' : 'dark'],
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(element)
    fitRef.current = fit
    termRef.current = term

    // Ctrl+C (Cmd+C on a Mac) copies while text is selected. With nothing selected it reaches the shell as an interrupt.
    // Ctrl+V and Cmd+V are left to the browser, which sends a paste event (handled below) instead of a key to the shell.
    term.attachCustomKeyEventHandler((event) => {
      if (!(event.ctrlKey || event.metaKey)) return true
      const key = event.key.toLowerCase()
      if (key === 'v') return false
      if (key !== 'c' || !term.hasSelection()) return true
      if (event.type === 'keydown') {
        void copyText(term.getSelection())
        term.clearSelection()
      }
      return false
    })
    // Pasting, by key, by menu or by middle click: the text goes to the prompt as typed, a new line running what came before it.
    const onPaste = (event: ClipboardEvent) => {
      const text = event.clipboardData?.getData('text/plain')
      if (!text) return
      event.preventDefault()
      event.stopPropagation()
      term.paste(text)
    }
    element.addEventListener('paste', onPaste, true)

    const all = useTerminals.getState().sessions[chatId]?.ops ?? []
    const past = all.filter((op) => op.terminalId === terminalId)
    // The current folder belongs to the environment, so every terminal of the chat shares it.
    let cwd = '/home/user'
    const editor = new LineEditor(
      past.flatMap((op) => (op.kind === 'shell' && op.source === 'user' ? [op.command] : [])),
      () => shellPrompt(chatId, cwd),
    )
    let busy = false
    // Typing and pasting that arrives while a command runs, kept for the next prompt.
    let waiting = ''
    let controller: AbortController | null = null
    const prompt = () => term.write(`${shellPrompt(chatId, cwd)}${editor.line}`)

    // The screen is rebuilt with each line's prompt as it was, folder included.
    for (const op of all) {
      if (op.terminalId === terminalId) writeOp(term, op, shellPrompt(chatId, cwd))
      if (op.kind === 'shell' && op.cwd) cwd = op.cwd
    }
    prompt()

    const run = async (line: string) => {
      if (line === 'clear') return (term.clear(), prompt())
      if (!line.trim()) return prompt()
      busy = true
      controller = new AbortController()
      if (sandboxStatus(chatId) !== 'ready') term.write(`${dim('Starting the environment…')}\r\n`)
      try {
        await runShellCommand(line, controller.signal, { session: chatId, source: 'user', terminalId })
      } catch {
        // What went wrong is shown by the event below.
      }
      busy = false
      controller = null
      // What was typed or pasted while it ran goes in once the prompt is back.
      if (waiting) {
        const typed = waiting
        waiting = ''
        window.setTimeout(() => feed(typed), 20)
      }
    }

    const feed = (data: string) => {
      for (const action of editor.feed(data)) {
        if (action.type === 'write') term.write(action.text)
        else if (action.type === 'clear') term.clear()
        else if (action.type === 'submit') void run(action.line)
        else if (action.type === 'interrupt') prompt()
      }
    }
    const input = term.onData((data) => {
      if (busy) {
        if (data.includes('\x03')) {
          controller?.abort()
          waiting = ''
          term.write('^C\r\n')
        } else waiting += data
        return
      }
      feed(data)
    })

    // Everything run in this terminal shows here, typed or Sensei's.
    const stop = onSandboxEvent(({ phase, op, failed }) => {
      if (op.session !== chatId) return
      if (phase === 'end' && op.kind === 'shell' && op.cwd) cwd = op.cwd
      if (op.terminalId !== terminalId) return
      if (phase === 'start') {
        if (op.source === 'ai') {
          term.write('\r\x1b[2K')
          writeOp(term, op, shellPrompt(chatId, cwd), false)
        }
        return
      }
      if (failed) term.write(`\x1b[31m${failed}\x1b[0m\r\n`)
      else if (op.kind === 'shell' && op.output) term.write(op.output.endsWith('\n') ? op.output : `${op.output}\n`)
      else if (op.kind === 'write' && op.source === 'ai') term.write(`${dim(`[${op.append ? 'appended to' : 'wrote'} ${op.path}]`)}\r\n`)
      if (op.source === 'ai') prompt()
      else if (!busy || op.source === 'user') {
        // A typed command is done once its output is shown: the next prompt.
        window.setTimeout(prompt, 0)
      }
    })

    const resize = new ResizeObserver(() => {
      if (element.clientWidth > 0 && element.clientHeight > 0) fit.fit()
    })
    resize.observe(element)

    return () => {
      stop()
      resize.disconnect()
      input.dispose()
      element.removeEventListener('paste', onPaste, true)
      controller?.abort()
      term.dispose()
      fitRef.current = null
      termRef.current = null
    }
  }, [chatId, terminalId])

  // A hidden terminal cannot measure itself, so it fits again when it is shown.
  useEffect(() => {
    if (!active) return
    const frame = requestAnimationFrame(() => {
      fitRef.current?.fit()
      termRef.current?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [active])

  return <div ref={host} className="size-full overflow-hidden px-2 py-1" />
}
