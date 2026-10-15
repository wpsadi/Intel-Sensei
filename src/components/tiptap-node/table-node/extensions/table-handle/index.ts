import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { TableMap, cellAround } from '@tiptap/pm/tables'
import type { Editor } from '@tiptap/react'
import { useSyncExternalStore } from 'react'

import { TABLE_UI_ATTR } from '@/lib/tiptap-table-utils'

/** The cell the pointer is over, in table coordinates. */
export interface TableHover {
  tablePos: number
  row: number
  col: number
}

export interface TableHandleStorage {
  hover: TableHover | null
  listeners: Set<() => void>
  setHover: (next: TableHover | null) => void
}

const key = new PluginKey('tableHandle')

const same = (a: TableHover | null, b: TableHover | null) =>
  a === b || (!!a && !!b && a.tablePos === b.tablePos && a.row === b.row && a.col === b.col)

/**
 * Tracks which table cell is hovered and shares it (via storage) with the row / column
 * handles, the selection overlay and the extend buttons. Required for those components.
 */
export const TableHandleExtension = Extension.create<object, TableHandleStorage>({
  name: 'tableHandle',

  addStorage() {
    const storage: TableHandleStorage = {
      hover: null,
      listeners: new Set(),
      setHover(next) {
        if (same(storage.hover, next)) return
        storage.hover = next
        storage.listeners.forEach((l) => l())
      },
    }
    return storage
  },

  addProseMirrorPlugins() {
    const storage = this.storage
    return [
      new Plugin({
        key,
        props: {
          handleDOMEvents: {
            mousemove: (view, event) => {
              if (!view.editable) return false
              const cell = (event.target as HTMLElement | null)?.closest?.('td,th')
              if (!cell || !view.dom.contains(cell)) return false
              try {
                const $cell = cellAround(view.state.doc.resolve(view.posAtDOM(cell, 0)))
                if (!$cell) return false
                // Innermost table around the cell
                let depth = $cell.depth
                while (depth > 0 && $cell.node(depth).type.spec.tableRole !== 'table') depth--
                if (depth === 0) return false
                const table = $cell.node(depth)
                const start = $cell.start(depth)
                const rect = TableMap.get(table).findCell($cell.pos - start)
                storage.setHover({ tablePos: $cell.before(depth), row: rect.top, col: rect.left })
              } catch {
                /* positions can be stale mid-transaction */
              }
              return false
            },
            mouseleave: (_view, event) => {
              const to = event.relatedTarget as HTMLElement | null
              // Moving onto a handle / button keeps the table active.
              if (to?.closest?.(`[${TABLE_UI_ATTR}]`)) return false
              storage.setHover(null)
              return false
            },
          },
        },
        view: () => ({
          update: (view) => {
            const hover = storage.hover
            if (!hover) return
            const node = hover.tablePos < view.state.doc.content.size ? view.state.doc.nodeAt(hover.tablePos) : null
            if (node?.type.spec.tableRole !== 'table') storage.setHover(null)
          },
        }),
      }),
    ]
  },
})

function storageOf(editor: Editor | null): TableHandleStorage | null {
  const s = (editor?.storage as unknown as Record<string, TableHandleStorage> | undefined)?.tableHandle
  return s ?? null
}

/** The hovered table cell, re-rendering on change. Null when no pointer is over a table. */
export function useTableHover(editor: Editor | null): TableHover | null {
  const storage = storageOf(editor)
  return useSyncExternalStore(
    (cb) => {
      storage?.listeners.add(cb)
      return () => void storage?.listeners.delete(cb)
    },
    () => storage?.hover ?? null,
    () => null,
  )
}

export function clearTableHover(editor: Editor | null) {
  storageOf(editor)?.setHover(null)
}
