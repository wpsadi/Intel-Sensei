import type { Editor } from '@tiptap/react'
import { useEffect } from 'react'

/** The top-level editor of each open page, so code outside the editor (agent tools) can edit it live. */
const editors = new Map<string, Editor>()
const waiters = new Map<string, Set<(editor: Editor) => void>>()

export function registerLiveEditor(pageId: string, editor: Editor) {
  editors.set(pageId, editor)
  waiters.get(pageId)?.forEach((resolve) => resolve(editor))
  waiters.delete(pageId)
  return () => {
    if (editors.get(pageId) === editor) editors.delete(pageId)
  }
}

export const getLiveEditor = (pageId: string) => {
  const editor = editors.get(pageId)
  return editor && !editor.isDestroyed ? editor : undefined
}

/** Resolves once the page's editor has mounted, or undefined after `timeout` ms. */
export function waitForLiveEditor(pageId: string, timeout = 5000): Promise<Editor | undefined> {
  const ready = getLiveEditor(pageId)
  if (ready) return Promise.resolve(ready)
  return new Promise((resolve) => {
    const set = waiters.get(pageId) ?? new Set()
    const done = (editor?: Editor) => {
      clearTimeout(timer)
      set.delete(done)
      resolve(editor)
    }
    const timer = setTimeout(done, timeout)
    set.add(done)
    waiters.set(pageId, set)
  })
}

/** Typing targets that keep their own undo: inputs, text areas and other editors, unless marked to pass undo through. */
function ownsUndo(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.closest('[data-undo-passthrough]')) return (target as HTMLInputElement).value !== '' && 'value' in target
  return target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
}

/**
 * Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl+Y undo and redo in the open page's editor even when focus is elsewhere,
 * such as after chatting with Sensei, so agent edits can be taken back from the keyboard.
 * Inside the editor itself, its own keymap handles them.
 */
export function useUndoShortcuts(pageId: string | undefined) {
  useEffect(() => {
    if (!pageId) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || ownsUndo(event.target)) return
      const key = event.key.toLowerCase()
      const redo = (key === 'z' && event.shiftKey) || (key === 'y' && !event.metaKey)
      if (key !== 'z' && !redo) return
      const editor = getLiveEditor(pageId)
      if (!editor) return
      event.preventDefault()
      if (redo) editor.commands.redo()
      else editor.commands.undo()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pageId])
}
