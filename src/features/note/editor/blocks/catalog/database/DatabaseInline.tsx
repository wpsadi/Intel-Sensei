import { DatabaseIcon } from 'lucide-react'

import { type BlockDefinition, database } from '../../insert'

/** Database - Inline block for the "/" and "+" menus. */
export const DatabaseInlineBlock: BlockDefinition = {
  group: 'Database',
  key: 'db-inline',
  title: 'Database - Inline',
  icon: <DatabaseIcon className="size-4" />,
  run: database('table'),
}
