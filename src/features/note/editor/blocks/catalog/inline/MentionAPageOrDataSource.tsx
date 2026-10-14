import { FileTextIcon } from 'lucide-react'

import { type BlockDefinition, chain } from '../../insert'

/** Mention a page or data source block for the "/" and "+" menus. */
export const MentionAPageOrDataSourceBlock: BlockDefinition = {
  group: 'Inline',
  key: 'mention-page',
  title: 'Mention a page or data source',
  icon: <FileTextIcon className="size-4" />,
  run: (e, r) => chain(e, r).insertContent('@').run(),
}
