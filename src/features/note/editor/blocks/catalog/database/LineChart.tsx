import { ChartLineIcon } from 'lucide-react'

import { type BlockDefinition, database } from '../../insert'

/** Line chart block for the "/" and "+" menus. */
export const LineChartBlock: BlockDefinition = {
  group: 'Database',
  key: 'db-line',
  title: 'Line chart',
  icon: <ChartLineIcon className="size-4" />,
  keywords: ['chart', 'database'],
  run: database('line'),
}
