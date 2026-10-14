import { ContextMenu } from '@base-ui/react/context-menu'
import { ChevronRightIcon } from 'lucide-react'
import type { ReactElement, ReactNode } from 'react'

import { COMMAND_DEFS, type CommandId, isEnabled, run, useLabel } from '@/features/s-3d/commands'

import type { MenuEntry } from './command-menus'

const itemClass =
  'flex cursor-default items-center gap-6 rounded-sm px-2 py-1 text-xs outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-40'
const popupClass = 'z-50 min-w-48 rounded-md bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none'

/** One command row. Its shortcut comes from the first binding, via useLabel, so it follows user rebinding. */
function CommandItem({ id }: { id: CommandId }) {
  const shortcut = useLabel(id)
  return (
    <ContextMenu.Item className={itemClass} disabled={!isEnabled(id)} onClick={() => run(id)}>
      {COMMAND_DEFS[id].label}
      {shortcut && <span className="ml-auto text-[10px] tracking-widest text-muted-foreground">{shortcut}</span>}
    </ContextMenu.Item>
  )
}

function Entries({ items }: { items: MenuEntry[] }) {
  return items.map((entry, i) => {
    if (entry === '-') return <ContextMenu.Separator key={i} className="my-1 h-px bg-border" />
    if (typeof entry === 'object')
      return (
        <ContextMenu.SubmenuRoot key={i}>
          <ContextMenu.SubmenuTrigger className={itemClass}>
            {entry.label}
            <ChevronRightIcon className="ml-auto size-3" />
          </ContextMenu.SubmenuTrigger>
          <ContextMenu.Portal>
            <ContextMenu.Positioner className="z-50 outline-none" alignOffset={-4} sideOffset={2}>
              <ContextMenu.Popup className={popupClass}>
                <Entries items={entry.items} />
              </ContextMenu.Popup>
            </ContextMenu.Positioner>
          </ContextMenu.Portal>
        </ContextMenu.SubmenuRoot>
      )
    return <CommandItem key={entry} id={entry as CommandId} />
  })
}

/** Right-click menu built from command ids. `items` is a function so enabled states are read when it opens. */
export function CommandContextMenu({ items, children, render }: { items: () => MenuEntry[]; children?: ReactNode; render?: ReactElement }) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger render={render}>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Positioner className="z-50 outline-none">
          <ContextMenu.Popup className={popupClass}>
            <Entries items={items()} />
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}
