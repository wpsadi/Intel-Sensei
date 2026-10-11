import { BlockFrame, BlockPlaceholder, atomBlock } from '../../../nodes/helpers'
import { DatabaseIcon } from 'lucide-react'
import { DatabaseView } from '../../../../database/DatabaseView'
import type { NodeViewProps } from '@tiptap/react'
import { pageTitle } from '../../../nodes/pages'
import { useDatabases } from '../../../../db/hooks'
import { useNoteStore } from '../../../../note.store'

/**
 * Inline database or linked view. `ownerId` keys the view set: equal to the database id for the
 * original inline database, or a fresh id for a linked view so it keeps its own views.
 */
function DatabaseBlockView({ node, updateAttributes, selected }: NodeViewProps) {
  const { databaseId, ownerId } = node.attrs as {
    databaseId: string
    ownerId: string
  }
  const databases = useDatabases()

  if (!databaseId) {
    return (
      <BlockFrame selected={selected}>
        <BlockPlaceholder icon={<DatabaseIcon className="size-4" />} label="Linked view of data source">
          <div className="flex w-full flex-col">
            {(databases ?? []).map((db) => (
              <button
                key={db.id}
                type="button"
                className="flex items-center gap-2 rounded px-2 py-1 text-left text-sm text-foreground hover:bg-muted"
                onClick={async () => {
                  const owner = crypto.randomUUID()
                  await useNoteStore.getState().createView(db.id, owner, 'table')
                  updateAttributes({ databaseId: db.id, ownerId: owner })
                }}
              >
                <DatabaseIcon className="size-4 text-muted-foreground" /> {pageTitle(db.title)}
              </button>
            ))}
            {databases?.length === 0 && <span className="text-xs">No databases yet — create one first.</span>}
          </div>
        </BlockPlaceholder>
      </BlockFrame>
    )
  }

  return (
    <BlockFrame selected={selected} className="snote-database-block">
      <DatabaseView databaseId={databaseId} ownerId={ownerId} linked={ownerId !== databaseId} />
    </BlockFrame>
  )
}

export const DatabaseBlock = atomBlock('databaseBlock', { databaseId: '', ownerId: '' }, DatabaseBlockView)
