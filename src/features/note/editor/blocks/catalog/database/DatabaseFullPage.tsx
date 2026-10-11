import { SheetIcon } from 'lucide-react'
import { type BlockDefinition, chain, hostPageId } from '../../insert'
import { useNoteStore } from '../../../../note.store'

/** Database - Full page block for the "/" and "+" menus. */
export const DatabaseFullPageBlock: BlockDefinition = {
  group: 'Database',
  key: 'db-full',
  title: 'Database - Full page',
  icon: <SheetIcon className="size-4" />,
  run: async (editor, range) => {
    const { page } = await useNoteStore.getState().createFullPageDatabase(hostPageId(editor), 'page')
    chain(editor, range)
      .insertContent({ type: 'pageBlock', attrs: { pageId: page.id } })
      .run()
  },
}
