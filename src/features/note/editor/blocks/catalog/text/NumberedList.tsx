import { ListOrderedIcon } from 'lucide-react'

import { type BlockDefinition, chain } from '../../insert'

/** Numbered list block for the "/" and "+" menus. */
export const NumberedListBlock: BlockDefinition = {
  group: 'Basic blocks',
  key: 'numbered',
  title: 'Numbered list',
  icon: <ListOrderedIcon className="size-4" />,
  keywords: ['ol', 'ordered'],
  run: (e, r) => chain(e, r).toggleOrderedList().run(),
}
