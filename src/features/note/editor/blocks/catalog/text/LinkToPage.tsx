import { FileSymlinkIcon } from 'lucide-react'
import { type BlockDefinition, block } from '../../insert'

/** Link to page block for the "/" and "+" menus. */
export const LinkToPageBlock: BlockDefinition = {
  group: 'Basic blocks',
  key: 'link-page',
  title: 'Link to page',
  icon: <FileSymlinkIcon className="size-4" />,
  run: block('pageBlock', { link: true }),
}
