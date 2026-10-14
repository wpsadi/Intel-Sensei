import { CalendarDaysIcon } from 'lucide-react'

import { type BlockDefinition, database } from '../../insert'

/** Calendar view block for the "/" and "+" menus. */
export const CalendarViewBlock: BlockDefinition = {
  group: 'Database',
  key: 'db-calendar',
  title: 'Calendar view',
  icon: <CalendarDaysIcon className="size-4" />,
  keywords: ['database'],
  run: database('calendar'),
}
