import { CodeIcon } from 'lucide-react'
import { type BlockDefinition, chain } from '../../insert'

/** Code block for the "/" and "+" menus. */
export const CodeBlock: BlockDefinition = {
  group: 'Basic blocks',
  key: 'code',
  title: 'Code',
  icon: <CodeIcon className="size-4" />,
  keywords: ['snippet'],
  run: (e, r) => chain(e, r).setCodeBlock().run(),
}
