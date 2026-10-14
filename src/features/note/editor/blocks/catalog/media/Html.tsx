import { CodeXmlIcon } from 'lucide-react'

import { type BlockDefinition, block } from '../../insert'

/** HTML block for the "/" and "+" menus. */
export const HtmlBlock: BlockDefinition = {
  group: 'Media',
  key: 'html',
  title: 'HTML',
  icon: <CodeXmlIcon className="size-4" />,
  keywords: ['raw'],
  run: block('embed', { kind: 'html' }),
}
