import { CalendarIcon } from 'lucide-react'

import { type BlockDefinition, chain } from '../../insert'

/** Date or reminder block for the "/" and "+" menus. */
export const DateOrReminderBlock: BlockDefinition = {
  group: 'Inline',
  key: 'date',
  title: 'Date or reminder',
  icon: <CalendarIcon className="size-4" />,
  run: (e, r) => chain(e, r).insertContent('@date').run(),
}
