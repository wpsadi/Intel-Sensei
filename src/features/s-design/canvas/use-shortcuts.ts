import { useHotkey } from '@tanstack/react-hotkeys'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'

import { useCommandHandler } from '@/features/s-3d/commands'
import { useS3D } from '@/features/s-3d/store'
import { scopeRank, useCommandScope, useHeldKeys, useScopeStack } from '@/lib/commands'

interface Options {
  setSpaceDown: (v: boolean) => void
  setAltDown: (v: boolean) => void
  pen: unknown[]
  finishPen: (closed?: boolean) => void
  cancelPen: () => void
}

/**
 * Canvas keys. Most commands live in the command map; this hook pushes the 'editor' scope,
 * supplies the commands that need canvas state (pen, selection walking), and tracks held Space and Alt.
 */
export function useCanvasShortcuts(opts: Options) {
  const ref = useRef(opts)
  useLayoutEffect(() => {
    ref.current = opts
  })

  // The scene editor has its own keys, and play mode has none.
  const mode = useS3D((st) => st.mode)
  const sceneEdit = useS3D((st) => st.sceneEdit)
  const tool = useS3D((st) => st.tool)
  const active = mode !== 'play' && !sceneEdit
  useCommandScope('editor', { enabled: active })
  // False while a modal scope (e.g. a dialog) sits above the editor.
  const editorLive = useScopeStack((st) => scopeRank('editor', st.stack) >= 0)
  const live = active && editorLive

  const penActive = () => useS3D.getState().tool === 'pen' && ref.current.pen.length > 0

  const escape = useMemo(
    () => ({
      run: () => {
        const st = useS3D.getState()
        if (penActive()) return ref.current.finishPen(false)
        if (st.tool !== 'select') return st.set({ tool: 'select' })
        const first = st.doc.nodes[st.selection[0]]
        st.set({ selection: first && st.doc.nodes[first.parentId] ? [first.parentId] : [] })
      },
    }),
    // penActive only reads the store and the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const enter = useMemo(
    () => ({
      // Otherwise Enter falls through, e.g. to a focused button.
      enabled: () => penActive() || useS3D.getState().selection.length === 1,
      run: () => {
        if (penActive()) return ref.current.finishPen(false)
        const st = useS3D.getState()
        const n = st.doc.nodes[st.selection[0]]
        if (n?.type === 'text') st.set({ editingTextId: n.id })
        else if (n?.children.length) st.set({ selection: [...n.children] })
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const cycle = (dir: 1 | -1) => ({
    // Without a single selection Tab keeps its normal focus behavior.
    enabled: () => useS3D.getState().selection.length === 1,
    run: () => {
      const st = useS3D.getState()
      const n = st.doc.nodes[st.selection[0]]
      const siblings = n ? (st.doc.nodes[n.parentId]?.children ?? st.doc.pages.find((p) => p.id === n.parentId)?.children ?? []) : []
      const i = siblings.indexOf(st.selection[0])
      const next = siblings[(i + dir + siblings.length) % siblings.length]
      if (next) st.set({ selection: [next] })
    },
  })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const selectNext = useMemo(() => cycle(1), [])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const selectPrevious = useMemo(() => cycle(-1), [])

  // While the pen has points, Backspace cancels the pen. Delete, and the menu item, still delete the selection.
  const penDelete = useMemo(
    () => ({
      enabled: () => true,
      run: (e?: KeyboardEvent) => {
        if (e?.key === 'Backspace') return ref.current.cancelPen()
        const st = useS3D.getState()
        if (st.selection.length) st.deleteNodes(st.selection)
      },
    }),
    [],
  )

  useCommandHandler('escape', escape)
  useCommandHandler('enter', enter)
  useCommandHandler('select-next', selectNext)
  useCommandHandler('select-previous', selectPrevious)
  useCommandHandler('delete', tool === 'pen' && opts.pen.length > 0 ? penDelete : null)

  // Held keys. The tracker names them 'Space' and 'Alt', and clears everything on window blur.
  const held = useHeldKeys()
  const spaceHeld = held.includes('Space')
  const altHeld = held.includes('Alt')

  // Space press: claim it so the page does not scroll. ignoreInputs skips editable targets.
  useHotkey('Space', () => ref.current.setSpaceDown(true), {
    enabled: live,
    ignoreInputs: true,
    preventDefault: true,
    stopPropagation: false,
    conflictBehavior: 'allow',
  })
  // Release, or blur, ends the pan.
  useEffect(() => {
    if (!spaceHeld) ref.current.setSpaceDown(false)
  }, [spaceHeld])

  useEffect(() => {
    ref.current.setAltDown(altHeld && live)
  }, [altHeld, live])
}
