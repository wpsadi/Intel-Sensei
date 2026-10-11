import { ChartColumnIcon } from 'lucide-react'
import { type BlockDefinition, database } from '../../insert'

/** Vertical bar chart block for the "/" and "+" menus. */
export const VerticalBarChartBlock: BlockDefinition = {
  group: 'Database',
  key: 'db-vbar',
  title: 'Vertical bar chart',
  icon: <ChartColumnIcon className="size-4" />,
  keywords: ['chart', 'database'],
  run: database('bar_vertical'),
}
