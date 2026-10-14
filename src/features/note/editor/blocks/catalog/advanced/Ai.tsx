import { SparklesIcon } from 'lucide-react'

import { type BlockDefinition, block } from '../../insert'

/** AI block for the "/" and "+" menus. */
export const AiBlock: BlockDefinition = {
  group: 'Advanced blocks',
  key: 'ai',
  title: 'AI Block',
  icon: <SparklesIcon className="size-4" />,
  keywords: ['ai', 'generate', 'claude'],
  run: block('aiBlock'),
}
