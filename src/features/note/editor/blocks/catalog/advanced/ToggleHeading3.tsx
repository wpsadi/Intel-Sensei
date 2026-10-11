import { Heading3Icon } from 'lucide-react'
import { type BlockDefinition, toggle } from '../../insert'

/** Toggle heading 3 block for the "/" and "+" menus. */
export const ToggleHeading3Block: BlockDefinition = {
  group: 'Advanced blocks',
  key: 'th3',
  title: 'Toggle heading 3',
  icon: <Heading3Icon className="size-4" />,
  run: toggle(3),
}
