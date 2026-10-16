import 'katex/dist/katex.min.css'
import '@/components/tiptap-node/table-node/styles/prosemirror-table.scss'
import '@/components/tiptap-node/table-node/styles/table-node.scss'
import { type Editor, EditorContent, useEditor } from '@tiptap/react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useDrop } from 'react-dnd'

import { TableCellHandleMenu } from '@/components/tiptap-node/table-node/ui/table-cell-handle-menu'
import { TableExtendRowColumnButtons } from '@/components/tiptap-node/table-node/ui/table-extend-row-column-button'
import { TableHandle } from '@/components/tiptap-node/table-node/ui/table-handle/table-handle'
import { type TableCellMenuProps, TableSelectionOverlay } from '@/components/tiptap-node/table-node/ui/table-selection-overlay'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'

import { putMedia } from '../db/media'
import { markdownToHtml } from '../lib/markdown-import'
import { BLOCK_DRAG, type BlockHover, type DraggedBlock, LIST_ITEMS, blockUnder } from './blocks/block-dom'
import { BlockActions } from './blocks/BlockActions'
import { BlockCommentsPanel } from './blocks/BlockCommentsPanel'
import { BlockHandle } from './blocks/BlockHandle'
import { BlockInsertMenu } from './blocks/BlockInsertMenu'
import { commentsOf } from './blocks/comments'
import { FormatMenu } from './blocks/FormatMenu'
import { EditorToolbar } from './EditorToolbar'
import { buildExtensions } from './extensions'
import { registerLiveEditor } from './live-editors'
import { EditorPageContext } from './nodes/block-utils'

interface NoteEditorProps {
  /** Serialized Tiptap JSON. Only read on mount; remount with a `key` to load other content. */
  content: string
  pageId?: string
  /** Editors inside synced blocks: no synced blocks and a lighter placeholder. */
  nested?: boolean
  /** Locked pages keep their content but cannot be edited. */
  editable?: boolean
  /** False for a document outside the page tree: no sub-page block in the "/" and "+" menus. */
  pages?: boolean
  onChange: (json: string) => void
}

const SAVE_DELAY = 400

// Module scope so the menu keeps its identity across renders; an inline component remounts it every time.
const CellMenu = ({ editor, onResizeStart }: TableCellMenuProps) => (
  <TableCellHandleMenu editor={editor} onMouseDown={(e) => onResizeStart?.('br')(e)} />
)

const parse = (content: string) => {
  try {
    return JSON.parse(content)
  } catch {
    return content
  }
}

function mediaKind(file: File) {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  if (file.type.startsWith('audio/')) return 'audio'
  return 'file'
}

/** Stores dropped / pasted files in the media cache and inserts matching blocks. */
async function insertFiles(editor: Editor, files: File[], at?: number) {
  const nodes = await Promise.all(
    files.map(async (file) => ({
      type: 'media',
      attrs: { kind: mediaKind(file), src: await putMedia(file, file.name), name: file.name },
    })),
  )
  if (at === undefined) editor.chain().focus().insertContent(nodes).run()
  else editor.chain().insertContentAt(at, nodes).run()
}

/** The node at a hovered block's start, or null once edits have shrunk the document past it. */
function hoveredNode(editor: Editor | null, start: number) {
  return editor && start < editor.state.doc.content.size ? editor.state.doc.nodeAt(start) : null
}

/** Pasted HTML that carries real formatting, which Tiptap's own paste keeps. */
const RICH_HTML = /<(strong|b|em|i|u|s|del|h[1-6]|ul|ol|li|table|a|code|pre|blockquote|img|hr)\b/i

export function NoteEditor({ content, pageId = '', nested = false, editable = true, pages = true, onChange }: NoteEditorProps) {
  const mobile = useIsMobile()
  const onChangeRef = useRef(onChange)
  useLayoutEffect(() => {
    onChangeRef.current = onChange
  })
  const extensions = useMemo(() => buildExtensions({ pageId, nested, pages }), [pageId, nested, pages])

  const editor = useEditor(
    {
      extensions,
      content: parse(content),
      immediatelyRender: true,
      shouldRerenderOnTransaction: false,
      editorProps: {
        attributes: { class: cn('snote-editor outline-none', nested ? 'min-h-6' : 'min-h-[40vh] pb-40') },
        handleDrop: (view, event, _slice, moved) => {
          const files = Array.from(event.dataTransfer?.files ?? [])
          if (moved || !files.length || !editorRef.current) return false
          event.preventDefault()
          const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
          insertFiles(editorRef.current, files, pos)
          return true
        },
        handlePaste: (view, event) => {
          const current = editorRef.current
          if (!current) return false
          // Inside a code block, paste the raw text at the cursor, untouched.
          if (view.state.selection.$from.parent.type.spec.code) {
            const raw = event.clipboardData?.getData('text/plain') ?? ''
            view.dispatch(view.state.tr.insertText(raw.replace(/\r\n?/g, '\n')).scrollIntoView())
            return true
          }
          const files = Array.from(event.clipboardData?.files ?? [])
          if (files.length) {
            insertFiles(current, files)
            return true
          }
          const text = event.clipboardData?.getData('text/plain')?.trim() ?? ''
          // Rich HTML pastes keep Tiptap's own handling; plain text that is Markdown becomes blocks. Editors, terminals
          // and chat apps often copy unformatted HTML too (the raw **asterisks** inside it), which counts as plain.
          const pastedHtml = event.clipboardData?.getData('text/html') ?? ''
          const html = text && !RICH_HTML.test(pastedHtml) ? markdownToHtml(text) : null
          if (html) {
            current.chain().focus().insertContent(html).run()
            return true
          }
          const synced = text.match(/^snote-synced:([\w-]+)$/)
          if (synced && !nested) {
            current
              .chain()
              .focus()
              .insertContent({ type: 'syncedBlock', attrs: { syncId: synced[1] } })
              .run()
            return true
          }
          return false
        },
      },
    },
    [extensions],
  )
  const editorRef = useRef<Editor | null>(editor)
  useLayoutEffect(() => {
    editorRef.current = editor
  })

  useEffect(() => {
    editor?.setEditable(editable)
  }, [editor, editable])

  // Nested editors (synced blocks, columns) belong to their host page's document, so only the page editor registers.
  useEffect(() => (editor && pageId && !nested ? registerLiveEditor(pageId, editor) : undefined), [editor, pageId, nested])

  // Debounced persistence of the document as JSON text. The JSON is captured on every update so a
  // pending save can still be flushed on unmount, after Tiptap has destroyed the editor.
  useEffect(() => {
    if (!editor) return
    let timer: ReturnType<typeof setTimeout> | undefined
    let pending: string | null = null
    const flush = () => {
      clearTimeout(timer)
      if (pending !== null) onChangeRef.current(pending)
      pending = null
    }
    const schedule = () => {
      pending = JSON.stringify(editor.getJSON())
      clearTimeout(timer)
      timer = setTimeout(flush, SAVE_DELAY)
    }
    editor.on('update', schedule)
    window.addEventListener('beforeunload', flush)
    return () => {
      editor.off('update', schedule)
      window.removeEventListener('beforeunload', flush)
      flush()
    }
  }, [editor])

  // Notion-style handles: hovering a top-level block shows "+" (add below) and a 6-dot grip (select block).
  const wrapRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<BlockHover | null>(null)
  const [menu, setMenu] = useState<{ at: number; top: number } | null>(null)
  const [blockActions, setBlockActions] = useState<{ start: number; size: number; top: number } | null>(null)
  const [commentsFor, setCommentsFor] = useState<{ start: number; top: number } | null>(null)

  const onMouseMove = (event: React.MouseEvent) => {
    if (!editor || !editable || !wrapRef.current) return
    const { clientX: x, clientY: y } = event
    // Moving across to the handles (through a callout's padding, say) keeps the current block.
    const wrapBox = wrapRef.current.getBoundingClientRect()
    if (
      hover &&
      x <= wrapBox.left + hover.left &&
      x >= wrapBox.left + hover.left - 56 &&
      y >= wrapBox.top + hover.top &&
      y <= wrapBox.top + hover.top + hover.height
    )
      return
    let target = event.target as Element
    if (!editor.view.dom.contains(target)) {
      // In the gutter: keep the current handle while the pointer stays level with its block…
      const box = wrapRef.current.getBoundingClientRect()
      if (hover && y >= box.top + hover.top && y <= box.top + hover.top + hover.height) return
      // …otherwise look into the content at the same height, so list rows are found instead of their whole list.
      const left = editor.view.dom.getBoundingClientRect().left
      target = [8, 32, 64].map((dx) => document.elementFromPoint(left + dx, y)).find((el) => el && editor.view.dom.contains(el)) ?? target
    }
    const found = blockUnder(editor, target, x, y)
    if (!found) return
    const box = found.dom.getBoundingClientRect()
    const wrap = wrapRef.current.getBoundingClientRect()
    setHover({ start: found.start, size: found.size, top: box.top - wrap.top, height: box.height, left: box.left - wrap.left })
  }

  // "+" adds an empty block below and opens the block menu for it. No "/" is typed into the document.
  const addBelow = () => {
    if (!editor || !hover) return
    const at = hover.start + hover.size
    const type = hoveredNode(editor, hover.start)?.type.name ?? ''
    // A list row gets a new empty row of the same kind; anything else gets a paragraph.
    if (LIST_ITEMS.includes(type)) {
      editor
        .chain()
        .focus()
        .insertContentAt(at, { type, content: [{ type: 'paragraph' }] })
        .setTextSelection(at + 2)
        .run()
      setMenu({ at: at + 2, top: hover.top + hover.height })
      return
    }
    editor
      .chain()
      .focus()
      .insertContentAt(at, { type: 'paragraph' })
      .setTextSelection(at + 1)
      .run()
    setMenu({ at: at + 1, top: hover.top + hover.height })
  }

  // Clicking the grip opens block actions (turn into, duplicate, delete). Dragging still moves the block.
  const openBlockActions = () => {
    if (hover) setBlockActions({ start: hover.start, size: hover.size, top: hover.top })
  }

  const [drop, setDrop] = useState<{ top: number; at: number } | null>(null)
  const clearDrop = useCallback(() => setDrop(null), [])

  // Where a dragged block would land: above or below the top-level block under the pointer.
  const targetAt = (x: number, y: number) => {
    if (!editor || !wrapRef.current) return null
    const found = blockUnder(editor, document.elementFromPoint(x, y) ?? wrapRef.current, x, y)
    if (!found) return null
    const box = found.dom.getBoundingClientRect()
    const wrap = wrapRef.current.getBoundingClientRect()
    const below = y > box.top + box.height / 2
    return { top: (below ? box.bottom : box.top) - wrap.top, at: below ? found.start + found.size : found.start }
  }

  const [, dropRef] = useDrop<DraggedBlock, void, unknown>(
    () => ({
      accept: BLOCK_DRAG,
      hover: (_item, monitor) => {
        const offset = monitor.getClientOffset()
        setDrop(offset ? targetAt(offset.x, offset.y) : null)
      },
      drop: (item: DraggedBlock, monitor) => {
        const offset = monitor.getClientOffset()
        const target = offset ? targetAt(offset.x, offset.y) : null
        setDrop(null)
        // Dropping a block onto its own spot does nothing.
        if (!editor || !target || (target.at >= item.start && target.at <= item.start + item.size)) return
        const node = editor.state.doc.nodeAt(item.start)
        if (!node) return
        // Moves the schema rejects (a list row outside a list, a paragraph between rows) are skipped.
        try {
          const tr = editor.state.tr
          tr.delete(item.start, item.start + item.size)
          tr.insert(tr.mapping.map(target.at), node)
          editor.view.dispatch(tr)
        } catch {
          /* invalid drop position */
        }
      },
    }),
    [editor],
  )

  return (
    <EditorPageContext.Provider value={{ pageId }}>
      {/* The left gutter (pl-12) sits inside this box, so moving onto the handles keeps the hover alive. */}
      <div
        ref={(node) => {
          wrapRef.current = node
          dropRef(node)
        }}
        className="relative -ml-12 pl-12"
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHover(null)}
      >
        {editable && hover && (
          <BlockHandle
            hover={hover}
            onAdd={addBelow}
            onOpenActions={openBlockActions}
            onDragEnd={clearDrop}
            commentCount={commentsOf(hoveredNode(editor, hover.start)?.attrs).length}
            onOpenComments={() => setCommentsFor({ start: hover.start, top: hover.top })}
          />
        )}
        {drop && <div className="pointer-events-none absolute right-0 left-12 h-0.5 rounded bg-blue-500" style={{ top: drop.top }} />}
        {menu && editor && <BlockInsertMenu editor={editor} at={menu.at} top={menu.top} onClose={() => setMenu(null)} />}
        {blockActions && editor && (
          <BlockActions
            editor={editor}
            {...blockActions}
            onClose={() => setBlockActions(null)}
            onComment={() => setCommentsFor({ start: blockActions.start, top: blockActions.top })}
          />
        )}
        {commentsFor && editor && (
          <BlockCommentsPanel key={commentsFor.start} editor={editor} {...commentsFor} onClose={() => setCommentsFor(null)} />
        )}
        {editable && !nested && mobile && editor && <EditorToolbar editor={editor} />}
        <EditorContent editor={editor} />
      </div>
      {editor && !mobile && <FormatMenu editor={editor} />}
      {editor && editable && (
        <>
          <TableHandle editor={editor} />
          <TableSelectionOverlay editor={editor} showResizeHandles cellMenu={CellMenu} />
          <TableExtendRowColumnButtons editor={editor} />
        </>
      )}
    </EditorPageContext.Provider>
  )
}
