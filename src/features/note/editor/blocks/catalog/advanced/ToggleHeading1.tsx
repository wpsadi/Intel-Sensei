import { Heading1Icon } from 'lucide-react'
import { type BlockDefinition, toggle } from '../../insert'

/** Toggle heading 1 block for the "/" and "+" menus. */
export const ToggleHeading1Block: BlockDefinition = {
  group: 'Advanced blocks',
  key: 'th1',
  title: 'Toggle heading 1',
  icon: <Heading1Icon className="size-4" />,
  run: toggle(1),
}
