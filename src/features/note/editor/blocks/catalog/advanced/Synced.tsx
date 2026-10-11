import { RefreshCwIcon } from 'lucide-react'
import { type BlockDefinition, block } from '../../insert'
import { useNoteStore } from '../../../../note.store'
import { EMPTY_DOC } from '../../../../db/repo'

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
