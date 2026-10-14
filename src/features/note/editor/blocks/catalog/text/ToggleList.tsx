import { ListCollapseIcon } from 'lucide-react'

import { type BlockDefinition, toggle } from '../../insert'

/** Toggle list block for the "/" and "+" menus. */
export const ToggleListBlock: BlockDefinition = {
  group: 'Basic blocks',
  key: 'toggle',
  title: 'Toggle list',
  icon: <ListCollapseIcon className="size-4" />,
  keywords: ['details', 'collapse'],
  run: toggle(0),
}
