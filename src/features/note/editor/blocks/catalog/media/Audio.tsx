import { MusicIcon } from 'lucide-react'

import { type BlockDefinition, block } from '../../insert'

/** Audio block for the "/" and "+" menus. */
export const AudioBlock: BlockDefinition = {
  group: 'Media',
  key: 'audio',
  title: 'Audio',
  icon: <MusicIcon className="size-4" />,
  keywords: ['sound', 'mp3'],
  run: block('media', { kind: 'audio' }),
}
