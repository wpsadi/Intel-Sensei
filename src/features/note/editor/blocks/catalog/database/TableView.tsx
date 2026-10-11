import { Table2Icon } from 'lucide-react'
import { type BlockDefinition, database } from '../../insert'

/** Table view block for the "/" and "+" menus. */
export const TableViewBlock: BlockDefinition = {
  group: 'Database',
  key: 'db-table',
  title: 'Table view',
  icon: <Table2Icon className="size-4" />,
  keywords: ['database'],
  run: database('table'),
}
