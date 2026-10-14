import { RefreshCwIcon } from 'lucide-react'

import { EMPTY_DOC } from '../../../../db/repo'
import { useNoteStore } from '../../../../note.store'
import { type BlockDefinition, block } from '../../insert'

/** Synced block for the "/" and "+" menus. */
export const SyncedBlock: BlockDefinition = {
  group: 'Advanced blocks',
  key: 'synced',
  title: 'Synced block',
  icon: <RefreshCwIcon className="size-4" />,
  keywords: ['sync', 'mirror'],
  run: async (editor, range) => {
    const syncId = crypto.randomUUID()
    await useNoteStore.getState().putSynced(syncId, EMPTY_DOC)
    block('syncedBlock', { syncId })(editor, range)
  },
}
