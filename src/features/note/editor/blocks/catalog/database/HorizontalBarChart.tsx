import { ChartBarBigIcon } from 'lucide-react'

import { type BlockDefinition, database } from '../../insert'

/** Horizontal bar chart block for the "/" and "+" menus. */
export const HorizontalBarChartBlock: BlockDefinition = {
  group: 'Database',
  key: 'db-hbar',
  title: 'Horizontal bar chart',
  icon: <ChartBarBigIcon className="size-4" />,
  keywords: ['chart', 'database'],
  run: database('bar_horizontal'),
}
