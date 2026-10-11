import { FileTextIcon } from 'lucide-react'
import { type BlockDefinition, chain, hostPageId } from '../../insert'
import { useNoteStore } from '../../../../note.store'

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
