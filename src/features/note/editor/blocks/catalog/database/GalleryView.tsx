import { LayoutGridIcon } from 'lucide-react'
import { type BlockDefinition, database } from '../../insert'

/** Gallery view block for the "/" and "+" menus. */
export const GalleryViewBlock: BlockDefinition = {
  group: 'Database',
  key: 'db-gallery',
  title: 'Gallery view',
  icon: <LayoutGridIcon className="size-4" />,
  keywords: ['database', 'cards'],
  run: database('gallery'),
}
