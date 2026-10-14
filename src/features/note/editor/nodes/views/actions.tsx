import type { NodeViewProps } from '@tiptap/react'
import { Settings2Icon, SparklesIcon } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { generateText } from '@/ai/inference/generate'

import { useNoteStore } from '../../../note.store'
import { useEditorPage } from '../block-utils'
import { BlockFrame } from '../helpers'

/* ---------------------------------- button -------------------------------- */

type ButtonAction = 'insert' | 'link' | 'page'

const ACTION_LABELS: Record<ButtonAction, string> = {
  insert: 'Insert blocks below',
  link: 'Open link',
  page: 'Add a sub page',
}

export function ButtonView({ node, updateAttributes, editor, getPos, selected }: NodeViewProps) {
  const { label, action, payload } = node.attrs as { label: string; action: ButtonAction; payload: string }
  const [configuring, setConfiguring] = useState(!payload && action !== 'page')
  const { pageId } = useEditorPage()
  const navigate = useNavigate()

  const run = async () => {
    if (action === 'link' && payload) window.open(/^https?:/.test(payload) ? payload : `https://${payload}`, '_blank')
    if (action === 'insert' && payload) {
      const at = (getPos() ?? 0) + node.nodeSize
      editor
        .chain()
        .insertContentAt(
          at,
          payload.split('\n').map((line) => ({ type: 'paragraph', content: line ? [{ type: 'text', text: line }] : [] })),
        )
        .run()
    }
    if (action === 'page') {
      const page = await useNoteStore.getState().createPage({ parentId: pageId, parentType: 'page', title: payload })
      const at = (getPos() ?? 0) + node.nodeSize
      editor
        .chain()
        .insertContentAt(at, { type: 'pageBlock', attrs: { pageId: page.id } })
        .run()
      navigate(`/s-note/${page.id}`)
    }
  }

  return (
    <BlockFrame selected={selected}>
      <div className="flex items-center gap-1">
        <button type="button" onClick={run} className="rounded-md border bg-background px-3 py-1 text-sm shadow-xs hover:bg-muted">
          {label || 'New button'}
        </button>
        <button type="button" onClick={() => setConfiguring(!configuring)} className="rounded p-1 text-muted-foreground hover:bg-muted">
          <Settings2Icon className="size-4" />
        </button>
      </div>
      {configuring && (
        <div className="mt-2 grid max-w-md gap-2 rounded-md border p-3 text-sm">
          <input
            value={label}
            onChange={(event) => updateAttributes({ label: event.target.value })}
            placeholder="Button name"
            className="h-8 rounded-md border bg-background px-2 outline-none"
          />
          <select
            value={action}
            onChange={(event) => updateAttributes({ action: event.target.value })}
            className="h-8 rounded-md border bg-background px-2"
          >
            {Object.entries(ACTION_LABELS).map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
          {action === 'insert' ? (
            <textarea
              value={payload}
              onChange={(event) => updateAttributes({ payload: event.target.value })}
              placeholder="Text inserted on every click (one block per line)"
              className="min-h-20 rounded-md border bg-background p-2 outline-none"
            />
          ) : (
            <input
              value={payload}
              onChange={(event) => updateAttributes({ payload: event.target.value })}
              placeholder={action === 'link' ? 'https://…' : 'New page title'}
              className="h-8 rounded-md border bg-background px-2 outline-none"
            />
          )}
          <button
            type="button"
            onClick={() => setConfiguring(false)}
            className="justify-self-end rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground"
          >
            Done
          </button>
        </div>
      )}
    </BlockFrame>
  )
}

/* ---------------------------------- AI block ------------------------------ */

export function AiView({ node, updateAttributes, editor, selected }: NodeViewProps) {
  const { prompt, output } = node.attrs as { prompt: string; output: string }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const run = async () => {
    setBusy(true)
    setError('')
    try {
      updateAttributes({ output: await generateText(prompt, editor.getText()) })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <BlockFrame selected={selected}>
      <div className="rounded-md border border-violet-300/50 bg-violet-50/40 p-3 dark:bg-violet-950/20">
        <div className="flex items-center gap-2">
          <SparklesIcon className="size-4 text-violet-500" />
          <input
            value={prompt}
            onChange={(event) => updateAttributes({ prompt: event.target.value })}
            onKeyDown={(event) => event.key === 'Enter' && prompt && run()}
            placeholder="Ask AI to write, summarize, brainstorm…"
            className="flex-1 bg-transparent text-sm outline-none"
          />
          <button
            type="button"
            disabled={!prompt || busy}
            onClick={run}
            className="rounded-md bg-violet-600 px-3 py-1 text-xs text-white disabled:opacity-50"
          >
            {busy ? 'Generating…' : output ? 'Regenerate' : 'Generate'}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
        {output && <div className="mt-3 text-sm whitespace-pre-wrap">{output}</div>}
      </div>
    </BlockFrame>
  )
}
