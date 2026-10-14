import { QuoteIcon } from 'lucide-react'

import { type BlockDefinition, chain } from '../../insert'

/** Quote block for the "/" and "+" menus. */
export const QuoteBlock: BlockDefinition = {
  group: 'Basic blocks',
  key: 'quote',
  title: 'Quote',
  icon: <QuoteIcon className="size-4" />,
  keywords: ['blockquote'],
  run: (e, r) => chain(e, r).setBlockquote().run(),
}
