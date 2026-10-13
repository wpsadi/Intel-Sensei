import { useEffect, useRef } from 'react'
import { COMMANDS, eventKey } from '@/features/s-3d/commands'
import { useS3D } from '@/features/s-3d/store'
import { useS3DDialog } from '@/features/s-3d/dialogs/dialog-store'

/** Copy, cut and paste go through clipboard events in the canvas, so they are not bound here. */
const CLIPBOARD = new Set(['mod+c', 'mod+x', 'mod+v'])

interface Options {
  setSpaceDown: (v: boolean) => void
  setAltDown: (v: boolean) => void
  pen: unknown[]
  finishPen: (closed?: boolean) => void
  cancelPen: () => void
}

export function useCanvasShortcuts(opts: Options) {
  const ref = useRef(opts)
  ref.current = opts

  useEffect(() => {
    const editable = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))
    const onKeyDown = (e: KeyboardEvent) => {
      const st = useS3D.getState()
      // The scene editor has its own keys.
      if (st.mode === 'play' || st.sceneEdit || useS3DDialog.getState().open) return
      if (e.key === 'Alt') ref.current.setAltDown(true)
      if (editable(e.target)) return
      if (e.code === 'Space') {
        e.preventDefault()
        ref.current.setSpaceDown(true)
        return
      }
      const key = eventKey(e)
      if (st.tool === 'pen' && ref.current.pen.length) {
        if (e.key === 'Enter') return ref.current.finishPen(false)
        if (e.key === 'Escape') return ref.current.finishPen(false)
        if (e.key === 'Backspace') return ref.current.cancelPen()
      }
      if (e.key === 'Escape') {
        if (st.tool !== 'select') return st.set({ tool: 'select' })
        const first = st.doc.nodes[st.selection[0]]
        return st.set({ selection: first && st.doc.nodes[first.parentId] ? [first.parentId] : [] })
      }
      if (e.key === 'Enter' && st.selection.length === 1) {
        const n = st.doc.nodes[st.selection[0]]
        if (n?.type === 'text') st.set({ editingTextId: n.id })
        else if (n?.children.length) st.set({ selection: [...n.children] })
        e.preventDefault()
        return
      }
      if (e.key === 'Tab' && st.selection.length === 1) {
        const n = st.doc.nodes[st.selection[0]]
        const siblings = n ? (st.doc.nodes[n.parentId]?.children ?? st.doc.pages.find((p) => p.id === n.parentId)?.children ?? []) : []
        const i = siblings.indexOf(st.selection[0])
        const next = siblings[(i + (e.shiftKey ? -1 : 1) + siblings.length) % siblings.length]
        if (next) st.set({ selection: [next] })
        e.preventDefault()
        return
      }
      if (e.key.startsWith('Arrow') && st.selection.length) {
        e.preventDefault()
        const d = e.shiftKey ? 10 : 1
        const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0
        const dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0
        st.updateNodes(st.selection.filter((id) => !st.doc.nodes[id]?.locked), (n) => {
          n.x += dx
          n.y += dy
        })
        return
      }
      if (key === 'mod+/' || key === 'shift+?') {
        e.preventDefault()
        return useS3DDialog.getState().setOpen('shortcuts')
      }
      if (key === 'mod+e') {
        e.preventDefault()
        return useS3DDialog.getState().setOpen('export')
      }
      if (key === 'mod+o') {
        e.preventDefault()
        return useS3DDialog.getState().setOpen('open')
      }
      if (CLIPBOARD.has(key)) return
      const c = COMMANDS.find((cm) => cm.keys?.includes(key))
      if (c) {
        e.preventDefault()
        if (!c.enabled || c.enabled()) c.run()
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') ref.current.setSpaceDown(false)
      if (e.key === 'Alt') ref.current.setAltDown(false)
    }
    const onBlur = () => {
      ref.current.setSpaceDown(false)
      ref.current.setAltDown(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])
}
