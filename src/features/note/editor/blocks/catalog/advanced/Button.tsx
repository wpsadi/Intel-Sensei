import { MousePointerClickIcon } from 'lucide-react'
import { type BlockDefinition, block } from '../../insert'

/** Button block for the "/" and "+" menus. */
export const ButtonBlock: BlockDefinition = {
  group: 'Advanced blocks',
  key: 'button',
  title: 'Button',
  icon: <MousePointerClickIcon className="size-4" />,
  keywords: ['action'],
  run: block('buttonBlock'),
}
