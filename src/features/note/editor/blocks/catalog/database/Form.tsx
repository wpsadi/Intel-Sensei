import { ClipboardListIcon } from 'lucide-react'

import { type BlockDefinition, database } from '../../insert'

/** Form block for the "/" and "+" menus. */
export const FormBlock: BlockDefinition = {
  group: 'Database',
  key: 'db-form',
  title: 'Form',
  icon: <ClipboardListIcon className="size-4" />,
  keywords: ['database', 'survey'],
  run: database('form'),
}
