import { TableIcon } from 'lucide-react'
import { type BlockDefinition, chain } from '../../insert'

/** Table block for the "/" and "+" menus. */
export const TableBlock: BlockDefinition = {
  group: 'Content blocks',
  key: 'table',
  title: 'Table',
  icon: <TableIcon className="size-4" />,
  keywords: ['grid'],
  run: (e, r) => chain(e, r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
}
