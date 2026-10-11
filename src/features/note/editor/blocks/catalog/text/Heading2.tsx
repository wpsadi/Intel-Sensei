import { Heading2Icon } from 'lucide-react'
import { type BlockDefinition, chain } from '../../insert'

/** Heading 2 block for the "/" and "+" menus. */
export const Heading2Block: BlockDefinition = {
  group: 'Basic blocks',
  key: 'h2',
  title: 'Heading 2',
  icon: <Heading2Icon className="size-4" />,
  keywords: ['h2'],
  run: (e, r) => chain(e, r).setHeading({ level: 2 }).run(),
}
