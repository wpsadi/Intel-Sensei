import { atomBlock } from '../../../nodes/block-utils'
import { DatabaseBlockView } from './DatabaseBlockView'

export const DatabaseBlock = atomBlock('databaseBlock', { databaseId: '', ownerId: '' }, DatabaseBlockView)
