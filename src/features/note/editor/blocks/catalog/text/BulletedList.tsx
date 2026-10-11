import { ListIcon } from 'lucide-react'
import { type BlockDefinition, chain } from '../../insert'

/** Bulleted list block for the "/" and "+" menus. */
export const BulletedListBlock: BlockDefinition = {
  group: 'Basic blocks',
  key: 'bullet',
  title: 'Bulleted list',
  icon: <ListIcon className="size-4" />,
  keywords: ['ul', 'unordered'],
  run: (e, r) => chain(e, r).toggleBulletList().run(),
}
