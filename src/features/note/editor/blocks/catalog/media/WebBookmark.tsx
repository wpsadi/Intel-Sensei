import { BookmarkIcon } from 'lucide-react'
import { type BlockDefinition, block } from '../../insert'

/** Web bookmark block for the "/" and "+" menus. */
export const WebBookmarkBlock: BlockDefinition = {
  group: 'Media',
  key: 'bookmark',
  title: 'Web bookmark',
  icon: <BookmarkIcon className="size-4" />,
  keywords: ['link', 'url'],
  run: block('embed', { kind: 'bookmark' }),
}
