import { LayoutDashboardIcon } from 'lucide-react'
import { type BlockDefinition, database } from '../../insert'

/** Dashboard view block for the "/" and "+" menus. */
export const DashboardViewBlock: BlockDefinition = {
  group: 'Database',
  key: 'db-dashboard',
  title: 'Dashboard view',
  icon: <LayoutDashboardIcon className="size-4" />,
  keywords: ['database'],
  run: database('dashboard'),
}
