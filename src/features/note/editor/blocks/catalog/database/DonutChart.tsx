import { ChartPieIcon } from 'lucide-react'
import { type BlockDefinition, database } from '../../insert'

/** Donut chart block for the "/" and "+" menus. */
export const DonutChartBlock: BlockDefinition = {
  group: 'Database',
  key: 'db-donut',
  title: 'Donut chart',
  icon: <ChartPieIcon className="size-4" />,
  keywords: ['chart', 'pie', 'database'],
  run: database('donut'),
}
