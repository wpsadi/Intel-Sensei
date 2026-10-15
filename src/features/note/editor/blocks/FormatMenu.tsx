import { NodeSelection } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'

import { ButtonGroup } from '@/components/tiptap-ui-primitive/button-group'
import { Separator } from '@/components/tiptap-ui-primitive/separator'
import { ColorHighlightPopover } from '@/components/tiptap-ui/color-highlight-popover'
import { HeadingDropdownMenu } from '@/components/tiptap-ui/heading-dropdown-menu'
import { LinkPopover } from '@/components/tiptap-ui/link-popover'
import { ListDropdownMenu } from '@/components/tiptap-ui/list-dropdown-menu'
import { MarkButton } from '@/components/tiptap-ui/mark-button'
import { TextAlignButton } from '@/components/tiptap-ui/text-align-button'

import { MarkButtons } from '../EditorToolbar'

/** Formatting menu shown over a text selection, built from Tiptap's UI components. */
export function FormatMenu({ editor }: { editor: Editor }) {
  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({ editor: e, state }) =>
        !state.selection.empty && !(state.selection instanceof NodeSelection) && e.isEditable && !e.isActive('codeBlock')
      }
      className="flex items-center gap-1 rounded-lg border bg-popover p-1 shadow-lg"
    >
      <ButtonGroup orientation="horizontal">
        <HeadingDropdownMenu editor={editor} levels={[1, 2, 3, 4]} modal={false} />
        <ListDropdownMenu editor={editor} types={['bulletList', 'orderedList', 'taskList']} modal={false} />
      </ButtonGroup>
      <Separator orientation="vertical" />
      <MarkButtons editor={editor} />
      <ButtonGroup orientation="horizontal">
        <MarkButton editor={editor} type="superscript" />
        <MarkButton editor={editor} type="subscript" />
      </ButtonGroup>
      <Separator orientation="vertical" />
      <ButtonGroup orientation="horizontal">
        <ColorHighlightPopover editor={editor} />
        <LinkPopover editor={editor} />
      </ButtonGroup>
      <Separator orientation="vertical" />
      <ButtonGroup orientation="horizontal">
        <TextAlignButton editor={editor} align="left" />
        <TextAlignButton editor={editor} align="center" />
        <TextAlignButton editor={editor} align="right" />
      </ButtonGroup>
    </BubbleMenu>
  )
}
