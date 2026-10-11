import { MinusIcon } from 'lucide-react'
import { type BlockDefinition, chain } from '../../insert'

/** Divider block for the "/" and "+" menus. */
export const DividerBlock: BlockDefinition = {
  group: 'Basic blocks',
  key: 'divider',
  title: 'Divider',
  icon: <MinusIcon className="size-4" />,
  keywords: ['hr', 'separator', 'line'],
  run: (e, r) => chain(e, r).setHorizontalRule().run(),
}
