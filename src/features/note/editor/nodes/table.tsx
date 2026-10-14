import { Table as BaseTable } from '@tiptap/extension-table'
import { ReactNodeViewRenderer } from '@tiptap/react'

import { TableView } from './views/table'

/** Table with a React node view. Same schema and commands as TipTap's table, so saved content is unchanged. */
export const Table = BaseTable.extend({
  addNodeView() {
    return ReactNodeViewRenderer(TableView)
  },
})
