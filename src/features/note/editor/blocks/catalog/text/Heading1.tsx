import { Heading1Icon } from 'lucide-react'

import { type BlockDefinition, chain } from '../../insert'

/** Heading 1 block for the "/" and "+" menus. */
export const Heading1Block: BlockDefinition = {
  group: 'Basic blocks',
  key: 'h1',
  title: 'Heading 1',
  icon: <Heading1Icon className="size-4" />,
  keywords: ['h1', 'title'],
  run: (e, r) => chain(e, r).setHeading({ level: 1 }).run(),
}
