import type { Editor } from '@tiptap/react'
import { useMemo, useRef, useState } from 'react'
import { useCloseOnOutsidePress } from '../nodes/helpers'
import { COMMANDS } from '../slash-commands'
import { type MenuItem, MenuList, rankMatches, useMenuKeys } from '../suggestion-menu'

interface BlockInsertMenuProps {
  editor: Editor
  /** Document position the chosen block is inserted at. */
  at: number
  top: number
  onClose: () => void
}

/** Block dialog opened by "+": the same commands and list as "/", with its own filter input. */
export function BlockInsertMenu({ editor, at, top, onClose }: BlockInsertMenuProps) {
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  useCloseOnOutsidePress(ref, onClose)
  const items = useMemo(() => rankMatches(COMMANDS, query), [query])

  const select = (item: MenuItem) => {
    onClose()
    item.run(editor, { from: at, to: at })
  }
  const { active, setActive, onKeyDown } = useMenuKeys(items, select)

  return (
    <div
      ref={ref}
      className="absolute left-12 z-50 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-lg"
      style={{ top }}
      contentEditable={false}
    >
      <input
        autoFocus
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose()
          else if (onKeyDown(event)) event.preventDefault()
        }}
        placeholder="Filter blocks…"
        className="h-9 w-full border-b bg-transparent px-3 text-sm outline-none"
      />
      <MenuList items={items} active={active} onActiveChange={setActive} onSelect={select} />
    </div>
  )
}
