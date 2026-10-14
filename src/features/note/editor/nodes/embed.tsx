import { atomBlock } from './block-utils'
import { EmbedView } from './views/embed'

export type { EmbedKind } from './views/embed'

export const Embed = atomBlock('embed', { kind: 'embed', url: '', html: '', title: '', description: '', width: 100 }, EmbedView)
