import { TableOfContentsIcon } from 'lucide-react'
import { type BlockDefinition, block } from '../../insert'

/** Table of contents block for the "/" and "+" menus. */
export const TableOfContentsBlock: BlockDefinition = {
  group: 'Advanced blocks',
  key: 'toc',
  title: 'Table of contents',
  icon: <TableOfContentsIcon className="size-4" />,
  keywords: ['toc'],
  run: block('tableOfContents'),
}
