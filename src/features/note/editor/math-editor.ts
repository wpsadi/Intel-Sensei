import type { Editor } from '@tiptap/core'

/** Closes the equation editor that is open now, if any. */
let closeOpen: (() => void) | null = null

/**
 * Opens a small LaTeX editor under the equation at `pos`, like Notion's. The equation updates as
 * you type; Enter or Done keeps it, Shift+Enter adds a line, Escape puts back what was there.
 */
export function openMathEditor(editor: Editor, pos: number, inline: boolean) {
  closeOpen?.()
  const node = editor.state.doc.nodeAt(pos)
  if (!node) return
  const original: string = node.attrs.latex ?? ''
  const update = (latex: string) =>
    inline ? editor.chain().updateInlineMath({ latex, pos }).run() : editor.chain().updateBlockMath({ latex, pos }).run()

  const panel = document.createElement('div')
  panel.className =
    'fixed z-50 flex w-[min(28rem,calc(100vw-2rem))] items-start gap-2 rounded-lg border bg-popover p-2 text-popover-foreground shadow-lg'
  const input = document.createElement('textarea')
  input.value = original
  input.rows = 1
  input.spellcheck = false
  input.placeholder = inline ? 'E = mc^2' : '|x| = \\begin{cases} x, & x \\geq 0 \\\\ -x, & x < 0 \\end{cases}'
  input.className =
    'max-h-60 min-h-8 flex-1 resize-none bg-transparent px-1 py-1 font-mono text-sm outline-none placeholder:text-muted-foreground'
  const done = document.createElement('button')
  done.type = 'button'
  done.textContent = 'Done ↵'
  done.className =
    'shrink-0 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90'
  panel.append(input, done)
  document.body.append(panel)

  const grow = () => {
    input.style.height = 'auto'
    input.style.height = `${input.scrollHeight}px`
  }
  // The node view is rebuilt on every change, so the equation's element is looked up each time.
  const place = () => {
    const target = editor.view.nodeDOM(pos) as HTMLElement | null
    if (!target?.isConnected) return
    const rect = target.getBoundingClientRect()
    const below = rect.bottom + 6
    const top = below + panel.offsetHeight > window.innerHeight ? rect.top - panel.offsetHeight - 6 : below
    panel.style.top = `${Math.max(8, top)}px`
    panel.style.left = `${Math.min(Math.max(8, rect.left), window.innerWidth - panel.offsetWidth - 8)}px`
  }

  const close = (keep: boolean) => {
    if (closeOpen !== finish) return
    closeOpen = null
    if (!keep) update(original)
    panel.remove()
    window.removeEventListener('scroll', place, true)
    window.removeEventListener('resize', place)
    document.removeEventListener('mousedown', outside, true)
    const after = editor.state.doc.nodeAt(pos)
    if (after) editor.chain().setTextSelection(pos + after.nodeSize).focus().run()
  }
  const finish = () => close(true)
  const outside = (event: MouseEvent) => {
    if (!panel.contains(event.target as Node)) finish()
  }

  input.addEventListener('input', () => {
    grow()
    update(input.value)
    place()
  })
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      finish()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      close(false)
    }
  })
  done.addEventListener('click', finish)
  window.addEventListener('scroll', place, true)
  window.addEventListener('resize', place)
  document.addEventListener('mousedown', outside, true)
  closeOpen = finish

  grow()
  place()
  input.focus()
  input.select()
}

/** Opens the editor on the equation just inserted near `from`. */
export function openNewMath(editor: Editor, from: number, inline: boolean) {
  const type = inline ? 'inlineMath' : 'blockMath'
  let found: number | null = null
  const { doc } = editor.state
  doc.nodesBetween(Math.max(0, from - 2), Math.min(doc.content.size, from + 4), (node, pos) => {
    if (found === null && node.type.name === type) found = pos
  })
  if (found !== null) openMathEditor(editor, found, inline)
}
