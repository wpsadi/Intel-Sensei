import { useLayoutEffect, useRef } from 'react'
import { matchPath, useLocation, useNavigate } from 'react-router-dom'

import { useNoteStore } from '../note.store'
import { type NoteToolContext, buildNoteTools } from './note-tools'

const LOG = '[S-Note WebMCP]'

interface ModelContext {
  registerTool(tool: object, options?: { signal?: AbortSignal }): unknown
  unregisterTool?(name: string): void
}

/** Chrome has exposed WebMCP on both `document` and `navigator` across versions; use whichever this browser has. */
const modelContext = () =>
  ((document as { modelContext?: ModelContext }).modelContext ?? (navigator as { modelContext?: ModelContext }).modelContext) as
    | ModelContext
    | undefined

/** Runs a tool and always resolves an MCP result, so the agent sees error text instead of a generic UnknownError. */
async function respond(name: string, execute: (args: unknown) => unknown, args: unknown) {
  console.log(LOG, 'call', name, args)
  try {
    const value = await execute(args)
    const text = typeof value === 'string' ? value : value === undefined ? '' : JSON.stringify(value)
    console.log(LOG, 'result', name, value)
    return { content: text ? [{ type: 'text', text }] : [] }
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error)
    console.warn(LOG, 'error', name, text)
    return { content: [{ type: 'text', text }], isError: true }
  }
}

/**
 * Registers the S-Note tools with the browser for in-browser agents while S-Note is open. Mount once in the S-Note
 * layout. Registers in a layout effect, once notes have loaded, and logs each step so a missing tool is easy to trace.
 */
export function NoteTools() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const ready = useNoteStore((s) => s.ready)

  // Tools read the latest route through a ref, so navigating never re-registers them.
  const ctx = useRef<NoteToolContext>({ go: navigate })
  useLayoutEffect(() => {
    ctx.current = { currentPageId: matchPath('/s-note/:pageId', pathname)?.params.pageId, go: navigate }
  })

  useLayoutEffect(() => {
    const mc = modelContext()
    console.log(
      LOG,
      'document.modelContext:',
      'modelContext' in document,
      '| navigator.modelContext:',
      'modelContext' in navigator,
      '| notes ready:',
      ready,
    )
    if (!mc) {
      console.warn(LOG, 'WebMCP is not available. Enable chrome://flags/#enable-webmcp-testing and restart Chrome.')
      return
    }
    if (!ready) return

    const controller = new AbortController()
    const handles: unknown[] = []
    const pending: Promise<unknown>[] = []
    for (const { execute, ...tool } of buildNoteTools(() => ctx.current)) {
      try {
        const handle = mc.registerTool(
          { ...tool, execute: (args: unknown) => respond(tool.name, execute, args) },
          { signal: controller.signal },
        )
        handles.push(handle)
        pending.push(Promise.resolve(handle).then(() => tool.name))
      } catch (error) {
        pending.push(Promise.reject(error))
      }
    }
    // Registration settles asynchronously. An AbortError only means this effect was cleaned up first
    // (StrictMode mounts twice in development), so it is not a failure.
    void Promise.allSettled(pending).then((results) => {
      if (controller.signal.aborted) return
      const failed = results.flatMap((r) => (r.status === 'rejected' ? [r.reason] : []))
      console.log(LOG, `${results.length - failed.length}/${results.length} tools live`)
      failed.forEach((error) => console.error(LOG, 'register failed', error))
    })

    return () => {
      controller.abort()
      // Older builds ignore the signal and unregister by name or through a returned handle instead.
      for (const handle of handles) (handle as { unregister?: () => void } | undefined)?.unregister?.()
      buildNoteTools(() => ctx.current).forEach((tool) => {
        try {
          mc.unregisterTool?.(tool.name)
        } catch {
          // Already removed through the signal.
        }
      })
      console.log(LOG, 'unregistered tools')
    }
  }, [ready])

  return null
}
