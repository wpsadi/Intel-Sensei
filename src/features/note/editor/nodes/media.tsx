import { atomBlock } from './block-utils'
import { MediaView } from './views/media'

export type { MediaKind } from './views/media'

export const Media = atomBlock('media', { kind: 'image', src: '', name: '', caption: '', width: 100 }, MediaView)
