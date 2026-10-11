import { MapIcon } from 'lucide-react'
import { type BlockDefinition, database } from '../../insert'

/** Map view block for the "/" and "+" menus. */
export const MapViewBlock: BlockDefinition = {
  group: 'Database',
  key: 'db-map',
  title: 'Map view',
  icon: <MapIcon className="size-4" />,
  keywords: ['database', 'location'],
  run: database('map'),
}
