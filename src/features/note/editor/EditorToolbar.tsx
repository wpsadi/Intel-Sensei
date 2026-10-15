import type { Editor } from '@tiptap/react'
import { useEffect, useState } from 'react'

import { ButtonGroup } from '@/components/tiptap-ui-primitive/button-group'
import { Separator } from '@/components/tiptap-ui-primitive/separator'
import { BlockquoteButton } from '@/components/tiptap-ui/blockquote-button'
import { CodeBlockButton } from '@/components/tiptap-ui/code-block-button'
import { ColorHighlightPopover } from '@/components/tiptap-ui/color-highlight-popover'
import { HeadingDropdownMenu } from '@/components/tiptap-ui/heading-dropdown-menu'
import { LinkPopover } from '@/components/tiptap-ui/link-popover'
import { ListDropdownMenu } from '@/components/tiptap-ui/list-dropdown-menu'
import { MarkButton } from '@/components/tiptap-ui/mark-button'
import { TextAlignButton } from '@/components/tiptap-ui/text-align-button'
import { UndoRedoButton } from '@/components/tiptap-ui/undo-redo-button'

/** Inline marks, shared by the fixed toolbar and the selection menu. */
export function MarkButtons({ editor }: { editor: Editor }) {
  return (
    <ButtonGroup orientation="horizontal">
      <MarkButton editor={editor} type="bold" />
      <MarkButton editor={editor} type="italic" />
      <MarkButton editor={editor} type="underline" />
      <MarkButton editor={editor} type="strike" />
      <MarkButton editor={editor} type="code" />
    </ButtonGroup>
  )
}

/** How far the on-screen keyboard covers the bottom of the page, so the bar can sit on top of it. */
function useKeyboardInset() {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const update = () => setInset(Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop))
    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
    }
  }, [])
  return inset
}

/**
 * Formatting bar for phones, stuck to the bottom of the screen (above the keyboard) since there is no room for a
 * floating menu over a selection. Built from Tiptap's UI components; desktop uses the selection menu instead.
 */
export function EditorToolbar({ editor }: { editor: Editor }) {
  const inset = useKeyboardInset()
  return (
    <div
      className="fixed inset-x-0 z-40 flex items-center gap-1 overflow-x-auto border-t bg-background p-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] shadow-[0_-2px_8px_rgb(0_0_0/0.08)]"
      style={{ bottom: inset }}
    >
      <ButtonGroup orientation="horizontal">
        <UndoRedoButton editor={editor} action="undo" />
        <UndoRedoButton editor={editor} action="redo" />
      </ButtonGroup>
      <Separator orientation="vertical" />
      <ButtonGroup orientation="horizontal">
        <HeadingDropdownMenu editor={editor} levels={[1, 2, 3, 4]} modal={false} />
        <ListDropdownMenu editor={editor} types={['bulletList', 'orderedList', 'taskList']} modal={false} />
        <BlockquoteButton editor={editor} />
        <CodeBlockButton editor={editor} />
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
        <TextAlignButton editor={editor} align="justify" />
      </ButtonGroup>
    </div>
  )
}
