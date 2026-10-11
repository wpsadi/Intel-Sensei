import { Rows3Icon } from 'lucide-react'
import { type BlockDefinition, database } from '../../insert'

/** List view block for the "/" and "+" menus. */
export const ListViewBlock: BlockDefinition = {
  group: 'Database',
  key: 'db-list',
  title: 'List view',
  icon: <Rows3Icon className="size-4" />,
  keywords: ['database'],
  run: database('list'),
}
