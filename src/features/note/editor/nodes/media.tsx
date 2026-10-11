import { BlockFrame, atomBlock, useCloseOnOutsidePress } from './helpers'
import { FileIcon, ImageIcon, MusicIcon, VideoIcon } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { mediaInfo, pickFile, putMedia } from '../../db/media'
import type { NodeViewProps } from '@tiptap/react'
import { useMediaUrl } from '../../db/hooks'

export type MediaKind = 'image' | 'video' | 'audio' | 'file'

const META: Record<MediaKind, { label: string; accept: string; icon: typeof ImageIcon }> = {
  image: { label: 'Add an image file', accept: 'image/*', icon: ImageIcon },
  video: { label: 'Add a video file', accept: 'video/*', icon: VideoIcon },
  audio: { label: 'Add an audio file', accept: 'audio/*', icon: MusicIcon },
  file: { label: 'Add a file', accept: '*/*', icon: FileIcon },
}

/** Empty state: icon and label, then an Upload / Link card with a "Choose a file" button. */
function MediaPicker({
  icon,
  label,
  accept,
  onFile,
  onLink,
}: {
  icon: ReactNode
  label: string
  accept: string
  onFile: (file: File) => void
  onLink: (url: string) => void
}) {
  const [tab, setTab] = useState<'upload' | 'link'>('upload')
  const [link, setLink] = useState('')
  // Opens when the block is first added and again when its label is clicked.
  const [open, setOpen] = useState(true)
  const ref = useRef<HTMLDivElement>(null)
  useCloseOnOutsidePress(ref, () => setOpen(false))

  const choose = async () => {
    const file = await pickFile(accept)
    if (file) onFile(file)
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted/60">
        {icon}
        {label}
      </button>
      {open && (
        <>
          <div className="absolute top-full left-0 z-50 mt-1 w-80 rounded-md border bg-popover p-3 text-popover-foreground shadow-lg" onClick={(event) => event.stopPropagation()}>
        <div className="flex gap-4 border-b">
          {(['upload', 'link'] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn('-mb-px border-b-2 px-1 pb-2', tab === key ? 'border-foreground font-medium' : 'border-transparent text-muted-foreground')}
            >
              {key === 'upload' ? 'Upload' : 'Link'}
            </button>
          ))}
        </div>
        {tab === 'upload' ? (
          <button type="button" onClick={choose} className="mt-3 w-full rounded-md bg-blue-600 py-2 font-medium text-white hover:bg-blue-700">
            Choose a file
          </button>
        ) : (
          <form
            className="mt-3 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              if (link.trim()) onLink(link.trim())
            }}
          >
            <input
              value={link}
              onChange={(event) => setLink(event.target.value)}
              placeholder="Paste a link…"
              className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 outline-none"
            />
            <button type="submit" className="rounded-md bg-blue-600 px-3 text-white hover:bg-blue-700">
              Embed
            </button>
          </form>
        )}
          </div>
        </>
      )}
    </div>
  )
}

/** YouTube / Vimeo page links become player iframes; anything else is played directly. */
function videoEmbedUrl(src: string) {
  const yt = src.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/)
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`
  const vimeo = src.match(/vimeo\.com\/(\d+)/)
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`
  return null
}

const formatSize = (bytes: number) =>
  bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : bytes > 1e3 ? `${(bytes / 1e3).toFixed(0)} KB` : `${bytes} B`

function MediaView({ node, updateAttributes, selected }: NodeViewProps) {
  const { kind, src, name, caption, width } = node.attrs as {
    kind: MediaKind
    src: string
    name: string
    caption: string
    width: number
  }
  const url = useMediaUrl(src)
  const [size, setSize] = useState(0)
  const meta = META[kind]

  useEffect(() => {
    if (kind === 'file' && src) mediaInfo(src).then((info) => info && setSize(info.size))
  }, [kind, src])

  if (!src) {
    const Icon = meta.icon
    return (
      <BlockFrame selected={selected}>
        <MediaPicker
          icon={<Icon className="size-4" />}
          label={meta.label}
          accept={meta.accept}
          onFile={async (file) => updateAttributes({ src: await putMedia(file, file.name), name: file.name })}
          onLink={(link) => updateAttributes({ src: link, name: link.split('/').pop() })}
        />
      </BlockFrame>
    )
  }

  const embed = kind === 'video' ? videoEmbedUrl(src) : null

  return (
    <BlockFrame selected={selected}>
      <figure className="group/media relative" style={{ width: kind === 'image' || kind === 'video' ? `${width}%` : undefined }}>
        {kind === 'image' && url && <img src={url} alt={caption || name} className="w-full rounded-md" draggable={false} />}
        {kind === 'video' &&
          (embed ? (
            <iframe src={embed} className="aspect-video w-full rounded-md" allowFullScreen title={name} />
          ) : (
            url && <video src={url} controls className="w-full rounded-md" />
          ))}
        {kind === 'audio' && url && <audio src={url} controls className="w-full" />}
        {kind === 'file' && (
          <a
            href={url}
            download={name}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
          >
            <FileIcon className="size-4 text-muted-foreground" />
            <span className="truncate">{name}</span>
            {size > 0 && <span className="text-xs text-muted-foreground">{formatSize(size)}</span>}
          </a>
        )}
        {(kind === 'image' || kind === 'video') && (
          <input
            type="range"
            min={20}
            max={100}
            value={width}
            onChange={(event) => updateAttributes({ width: Number(event.target.value) })}
            className="absolute top-2 right-2 w-24 opacity-0 transition group-hover/media:opacity-100"
            title="Resize"
          />
        )}
        {kind !== 'file' && (
          <input
            value={caption}
            onChange={(event) => updateAttributes({ caption: event.target.value })}
            placeholder="Write a caption…"
            className="mt-1 w-full bg-transparent text-sm text-muted-foreground outline-none placeholder:opacity-0 focus:placeholder:opacity-100"
          />
        )}
      </figure>
    </BlockFrame>
  )
}

export const Media = atomBlock('media', { kind: 'image', src: '', name: '', caption: '', width: 100 }, MediaView)
