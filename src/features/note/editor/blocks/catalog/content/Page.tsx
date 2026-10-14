import { FileTextIcon } from 'lucide-react'

import { useNoteStore } from '../../../../note.store'
import { type BlockDefinition, chain, hostPageId } from '../../insert'

/** Page block for the "/" and "+" menus. */
export const PageBlock: BlockDefinition = {
  group: 'Content blocks',
  key: 'page',
  title: 'Page',
  subtitle: 'Embed a sub-page inside this page',
  icon: <FileTextIcon className="size-4" />,
  run: async (editor, range) => {
    const page = await useNoteStore.getState().createPage({ parentId: hostPageId(editor), parentType: 'page' })
    chain(editor, range)
      .insertContent({ type: 'pageBlock', attrs: { pageId: page.id } })
      .run()
  },
}
