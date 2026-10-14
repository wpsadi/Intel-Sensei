import { Heading3Icon } from 'lucide-react'

import { type BlockDefinition, chain } from '../../insert'

/** Heading 3 block for the "/" and "+" menus. */
export const Heading3Block: BlockDefinition = {
  group: 'Basic blocks',
  key: 'h3',
  title: 'Heading 3',
  icon: <Heading3Icon className="size-4" />,
  keywords: ['h3'],
  run: (e, r) => chain(e, r).setHeading({ level: 3 }).run(),
}
