import { AppWindowIcon } from 'lucide-react'

import { type BlockDefinition, block } from '../../insert'

/** Embed block for the "/" and "+" menus. */
export const EmbedBlock: BlockDefinition = {
  group: 'Media',
  key: 'embed',
  title: 'Embed',
  icon: <AppWindowIcon className="size-4" />,
  keywords: ['iframe'],
  run: block('embed', { kind: 'embed' }),
}
