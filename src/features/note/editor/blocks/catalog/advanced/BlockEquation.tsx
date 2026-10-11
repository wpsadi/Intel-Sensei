import { SigmaIcon } from 'lucide-react'
import { type BlockDefinition, math } from '../../insert'

/** Block equation block for the "/" and "+" menus. */
export const BlockEquationBlock: BlockDefinition = {
  group: 'Advanced blocks',
  key: 'equation',
  title: 'Block equation',
  icon: <SigmaIcon className="size-4" />,
  keywords: ['math', 'latex', 'katex'],
  run: math(false),
}
