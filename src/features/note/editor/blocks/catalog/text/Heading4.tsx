import { Heading4Icon } from 'lucide-react'
import { type BlockDefinition, chain } from '../../insert'

/** Heading 4 block for the "/" and "+" menus. */
export const Heading4Block: BlockDefinition = {
  group: 'Basic blocks',
  key: 'h4',
  title: 'Heading 4',
  icon: <Heading4Icon className="size-4" />,
  keywords: ['h4'],
  run: (e, r) => chain(e, r).setHeading({ level: 4 }).run(),
}
