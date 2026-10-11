import { ImageIcon, SmileIcon } from 'lucide-react'
import { useNoteStore } from '../note.store'
import { pickFile, putMedia } from '../db/media'
import { useDatabase, useMediaUrl, usePage } from '../db/hooks'
import { DatabaseView } from '../database/DatabaseView'
import { IconPicker } from './IconPicker'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { PageIcon } from '../editor/nodes/pages'
import { NoteEditor } from '../editor/NoteEditor'
import type { Page } from '../db/types'
import { PropertyEditor } from '../database/properties'
import { displaySettings } from '../lib/display'
import { useRef, useState } from 'react'

const COVERS = [
  'linear-gradient(135deg,#f6d365,#fda085)',
  'linear-gradient(135deg,#a1c4fd,#c2e9fb)',
  'linear-gradient(135deg,#d4fc79,#96e6a1)',
  'linear-gradient(135deg,#fbc2eb,#a6c1ee)',
  'linear-gradient(135deg,#434343,#000000)',
]

function Cover({ page, locked }: { page: Page; locked: boolean }) {
  const updatePage = useNoteStore((s) => s.updatePage)
  const isGradient = page.cover.startsWith('linear-gradient')
  const url = useMediaUrl(isGradient ? undefined : page.cover)
  // Draft position while repositioning; null when not repositioning.
  const [draftY, setDraftY] = useState<number | null>(null)
  const drag = useRef<{ startY: number; startPos: number; height: number } | null>(null)
  const y = draftY ?? page.coverY ?? 50
  const repositioning = draftY !== null

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!repositioning) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { startY: event.clientY, startPos: y, height: event.currentTarget.offsetHeight }
  }
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    const { startY, startPos, height } = drag.current
    // Dragging the image down reveals its top, so the position decreases.
    const next = startPos - ((event.clientY - startY) / height) * 100
    setDraftY(Math.min(100, Math.max(0, next)))
  }
  const onPointerUp = () => {
    drag.current = null
  }

  const btn = 'rounded bg-background/80 px-2 py-1 text-xs'
  return (
    <div
      className={`group/cover relative h-48 w-full select-none ${repositioning ? 'cursor-move' : ''}`}
      style={{ background: isGradient ? page.cover : `center ${y}% / cover no-repeat url("${url}")` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {repositioning ? (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-1/2 mx-auto w-fit -translate-y-1/2 rounded bg-background/80 px-3 py-1 text-xs">Drag image to reposition</div>
          <div className="absolute right-4 bottom-3 flex gap-1" onPointerDown={(event) => event.stopPropagation()}>
            <button
              type="button"
              onClick={() => {
                updatePage(page.id,{ coverY: Math.round(y * 10) / 10 })
                setDraftY(null)
              }}
              className={btn}
            >
              Save position
            </button>
            <button type="button" onClick={() => setDraftY(null)} className={btn}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <div className={`absolute right-4 bottom-3 flex gap-1 opacity-0 transition group-hover/cover:opacity-100 ${locked ? 'hidden' : ''}`}>
          <button type="button" onClick={() => updatePage(page.id,{ cover: COVERS[(COVERS.indexOf(page.cover) + 1) % COVERS.length] })} className={btn}>
            Change cover
          </button>
          <button
            type="button"
            onClick={async () => {
              const file = await pickFile('image/*')
              if (!file) return
              await updatePage(page.id,{ cover: await putMedia(file, file.name), coverY: 50 })
              setDraftY(50)
            }}
            className={btn}
          >
            Upload
          </button>
          {!isGradient && (
            <button type="button" onClick={() => setDraftY(page.coverY ?? 50)} className={btn}>
              Reposition
            </button>
          )}
          <button type="button" onClick={() => updatePage(page.id,{ cover: '' })} className={btn}>
            Remove
          </button>
        </div>
      )}
    </div>
  )
}

/** Property list shown at the top of a database row page. */
function RowProperties({ page }: { page: Page }) {
  const database = useDatabase(page.parentId ?? undefined)
  if (!database) return null
  return (
    <div className="mb-4 flex flex-col gap-0.5 border-b pb-4 text-sm">
      {database.properties
        .filter((p) => p.type !== 'title')
        .map((prop) => (
          <div key={prop.id} className="grid grid-cols-[160px_1fr] items-center">
            <span className="truncate px-1.5 text-muted-foreground">{prop.name}</span>
            <PropertyEditor database={database} prop={prop} row={page} />
          </div>
        ))}
    </div>
  )
}

export function PageView({ pageId }: { pageId: string }) {
  const page = usePage(pageId)
  const fullPageDb = useDatabase(page?.kind === 'database' ? page.databaseId : undefined)
  const [picker, setPicker] = useState(false)
  const addIconRef = useRef<HTMLButtonElement>(null)
  const updatePage = useNoteStore((s) => s.updatePage)
  const contentRevision = useNoteStore((s) => s.contentRevision[pageId] ?? 0)
  const updateDatabase = useNoteStore((s) => s.updateDatabase)
  const setPageTrashed = useNoteStore((s) => s.setPageTrashed)

  if (page === undefined) return null
  if (!page) return <p className="p-16 text-center text-muted-foreground">This page does not exist.</p>
  const view = displaySettings(page)
  // Trashed pages stay viewable but cannot be edited until restored.
  const locked = view.locked || page.trashed

  const title = page.kind === 'database' ? (fullPageDb?.title ?? '') : page.title
  // Full-page databases keep the page title and database title in step.
  const setTitle = (value: string) => {
    updatePage(page.id,{ title: value })
    if (fullPageDb) updateDatabase(fullPageDb.id, { title: value })
  }

  return (
    <div className={`pb-24 snote-font-${view.font}${view.smallText ? ' snote-small' : ''}`}>
      {page.trashed && (
        <div className="flex items-center justify-center gap-3 bg-red-500 px-4 py-2 text-sm text-white">
          This page is in Trash.
          <button type="button" onClick={() => setPageTrashed(page.id, false)} className="rounded border border-white/60 px-2">
            Restore
          </button>
        </div>
      )}
      {page.cover && <Cover page={page} locked={locked} />}
      <div
        className={
          page.kind === 'database' ? 'px-8 sm:px-16' : view.fullWidth ? 'px-6 sm:px-12' : 'mx-auto max-w-3xl px-6 sm:px-12'
        }
      >
        <div className="relative">
          {/* Anchored to the page icon (or the "Add icon" button) and kept inside the viewport. */}
          <Popover open={picker} onOpenChange={setPicker}>
            {page.icon && (
              <PopoverTrigger render={<button type="button" className={`${page.cover ? '-mt-10' : 'mt-12'} block text-7xl leading-none`} />}>
                <PageIcon icon={page.icon} className="size-20 text-7xl" />
              </PopoverTrigger>
            )}
            <PopoverContent align="start" anchor={page.icon ? undefined : addIconRef} className="w-auto rounded-md p-0">
              <IconPicker
                onPick={(icon) => {
                  updatePage(page.id,{ icon })
                  setPicker(false)
                }}
                onRemove={() => {
                  updatePage(page.id,{ icon: '' })
                  setPicker(false)
                }}
              />
            </PopoverContent>
          </Popover>
        </div>
        <div className={`group/title ${page.icon || page.cover ? 'pt-4' : 'pt-16'}`}>
          <div className="mb-1 flex gap-1 text-sm text-muted-foreground opacity-0 transition group-hover/title:opacity-100">
            {!locked && !page.icon && (
              <button ref={addIconRef} type="button" onClick={() => setPicker(true)} className="flex items-center gap-1 rounded px-2 py-0.5 hover:bg-muted">
                <SmileIcon className="size-4" /> Add icon
              </button>
            )}
            {!locked && !page.cover && (
              <button type="button" onClick={() => updatePage(page.id,{ cover: COVERS[0] })} className="flex items-center gap-1 rounded px-2 py-0.5 hover:bg-muted">
                <ImageIcon className="size-4" /> Add cover
              </button>
            )}
          </div>
          <input
            key={page.id}
            defaultValue={title}
            readOnly={locked}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={page.kind === 'database' ? 'Untitled database' : 'New Page'}
            onKeyDown={(event) => {
              // Enter in the title moves the caret into the page body, like Notion.
              if (event.key !== 'Enter' || page.kind === 'database') return
              event.preventDefault()
              document.querySelector<HTMLElement>('.ProseMirror')?.focus()
            }}
            className="mb-4 w-full bg-transparent text-4xl font-bold outline-none placeholder:text-muted-foreground/40"
          />
        </div>
        {page.parentType === 'database' && <RowProperties page={page} />}
        {page.kind === 'database' && page.databaseId ? (
          <DatabaseView databaseId={page.databaseId} ownerId={page.databaseId} fullPage />
        ) : (
          <NoteEditor
            key={`${page.id}:${contentRevision}`}
            pageId={page.id}
            content={page.content}
            editable={!locked}
            onChange={(content) => updatePage(page.id,{ content })}
          />
        )}
      </div>
    </div>
  )
}
