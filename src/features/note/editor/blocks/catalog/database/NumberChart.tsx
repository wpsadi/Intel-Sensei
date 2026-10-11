import { HashIcon } from 'lucide-react'
import { type BlockDefinition, database } from '../../insert'

/** Number chart block for the "/" and "+" menus. */
export const NumberChartBlock: BlockDefinition = {
  group: 'Database',
  key: 'db-number',
  title: 'Number chart',
  icon: <HashIcon className="size-4" />,
  keywords: ['chart', 'kpi', 'database'],
  run: database('number'),
}
