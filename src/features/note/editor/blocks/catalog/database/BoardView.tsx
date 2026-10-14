import { KanbanIcon } from 'lucide-react'

import { type BlockDefinition, database } from '../../insert'

/** Board view block for the "/" and "+" menus. */
export const BoardViewBlock: BlockDefinition = {
  group: 'Database',
  key: 'db-board',
  title: 'Board view',
  icon: <KanbanIcon className="size-4" />,
  keywords: ['kanban', 'database'],
  run: database('board'),
}
