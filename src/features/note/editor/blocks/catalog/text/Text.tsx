import { TypeIcon } from 'lucide-react'

import { type BlockDefinition, chain } from '../../insert'

/** Text block for the "/" and "+" menus. */
export const TextBlock: BlockDefinition = {
  group: 'Basic blocks',
  key: 'text',
  title: 'Text',
  icon: <TypeIcon className="size-4" />,
  keywords: ['paragraph', 'plain'],
  run: (e, r) => chain(e, r).setParagraph().run(),
}
