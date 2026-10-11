import { Heading2Icon } from 'lucide-react'
import { type BlockDefinition, toggle } from '../../insert'

/** Toggle heading 2 block for the "/" and "+" menus. */
export const ToggleHeading2Block: BlockDefinition = {
  group: 'Advanced blocks',
  key: 'th2',
  title: 'Toggle heading 2',
  icon: <Heading2Icon className="size-4" />,
  run: toggle(2),
}
