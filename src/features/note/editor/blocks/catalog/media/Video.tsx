import { VideoIcon } from 'lucide-react'

import { type BlockDefinition, block } from '../../insert'

/** Video block for the "/" and "+" menus. */
export const VideoBlock: BlockDefinition = {
  group: 'Media',
  key: 'video',
  title: 'Video',
  icon: <VideoIcon className="size-4" />,
  keywords: ['youtube', 'movie'],
  run: block('media', { kind: 'video' }),
}
