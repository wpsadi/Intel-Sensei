import { ChartGanttIcon } from 'lucide-react'
import { type BlockDefinition, database } from '../../insert'

/** Timeline view block for the "/" and "+" menus. */
export const TimelineViewBlock: BlockDefinition = {
  group: 'Database',
  key: 'db-timeline',
  title: 'Timeline view',
  icon: <ChartGanttIcon className="size-4" />,
  keywords: ['database', 'gantt'],
  run: database('timeline'),
}
