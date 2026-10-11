import { useMemo, useState } from 'react'
import { gitHubEmojis } from '@tiptap/extension-emoji'
import { pickFile, putMedia } from '../db/media'
import { PAGE_ICONS, lucideRef } from '../lib/page-icons'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

const EMOJIS = gitHubEmojis.filter((e) => e.emoji)
const ICON_NAMES = Object.keys(PAGE_ICONS)

type Tab = 'emoji' | 'icons' | 'upload'
const TABS: { key: Tab; label: string }[] = [
  { key: 'emoji', label: 'Emoji' },
  { key: 'icons', label: 'Icons' },
  { key: 'upload', label: 'Upload' },
]

/** Page icon drawer: emoji, built-in icons, or an uploaded image. Calls `onPick` with the value to store. */
export function IconPicker({ onPick, onRemove }: { onPick: (icon: string) => void; onRemove?: () => void }) {
  const [tab, setTab] = useState<Tab>('emoji')
  const [query, setQuery] = useState('')
  const q = query.toLowerCase().trim()

  const emojis = useMemo(() => {
    const list = q ? EMOJIS.filter((e) => e.shortcodes.some((s) => s.includes(q)) || e.tags.some((t) => t.includes(q))) : EMOJIS
    return list.slice(0, 240)
  }, [q])

  const icons = useMemo(() => ICON_NAMES.filter((name) => name.toLowerCase().includes(q)), [q])

  const upload = async () => {
    const file = await pickFile('image/*')
    if (file) onPick(await putMedia(file, file.name))
  }

  return (
    <div className="w-80 p-2">
      <div className="mb-2 flex items-center gap-1 border-b pb-2 text-sm">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={cn('rounded-md px-2 py-1', tab === item.key ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/60')}
          >
            {item.label}
          </button>
        ))}
        {onRemove && (
          <button type="button" onClick={onRemove} className="ml-auto rounded-md px-2 py-1 text-muted-foreground hover:bg-muted">
            Remove
          </button>
        )}
      </div>

      {tab !== 'upload' && (
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter…"
          className="mb-2 h-8 w-full rounded-md border bg-background px-2 text-sm outline-none"
        />
      )}

      {tab === 'emoji' && (
        <ScrollArea className="h-64 pr-2">
          <div className="grid grid-cols-8">
            {emojis.map((e) => (
              <button key={e.name} type="button" title={e.shortcodes[0]} onClick={() => onPick(e.emoji!)} className="rounded p-1 text-xl hover:bg-muted">
                {e.emoji}
              </button>
            ))}
          </div>
        </ScrollArea>
      )}

      {tab === 'icons' && (
        <ScrollArea className="h-64 pr-2">
          <div className="grid grid-cols-8">
            {icons.map((name) => {
              const Icon = PAGE_ICONS[name]
              return (
                <button key={name} type="button" title={name} onClick={() => onPick(lucideRef(name))} className="flex items-center justify-center rounded p-2 hover:bg-muted">
                  <Icon className="size-5" />
                </button>
              )
            })}
          </div>
        </ScrollArea>
      )}

      {tab === 'upload' && (
        <div className="flex flex-col items-center gap-3 py-6 text-sm">
          <p className="text-muted-foreground">Use an image from your computer as the page icon.</p>
          <button type="button" onClick={upload} className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground">
            Choose image
          </button>
        </div>
      )}
    </div>
  )
}
