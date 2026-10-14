import { atomBlock } from './block-utils'
import { SyncedView } from './views/data'

export const SyncedBlock = atomBlock('syncedBlock', { syncId: '' }, SyncedView)
