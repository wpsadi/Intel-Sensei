import { ImageIcon } from 'lucide-react'

import { type BlockDefinition, block } from '../../insert'

/** Image block for the "/" and "+" menus. */
export const ImageBlock: BlockDefinition = {
  group: 'Media',
  key: 'image',
  title: 'Image',
  icon: <ImageIcon className="size-4" />,
  keywords: ['photo', 'picture'],
  run: block('media', { kind: 'image' }),
}
