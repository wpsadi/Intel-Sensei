import { SquareSigmaIcon } from 'lucide-react'

import { type BlockDefinition, math } from '../../insert'

/** Inline equation block for the "/" and "+" menus. */
export const InlineEquationBlock: BlockDefinition = {
  group: 'Advanced blocks',
  key: 'inline-equation',
  title: 'Inline equation',
  icon: <SquareSigmaIcon className="size-4" />,
  keywords: ['math', 'latex'],
  run: math(true),
}
