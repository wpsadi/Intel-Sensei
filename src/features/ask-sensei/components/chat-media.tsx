import '@videojs/react/video/skin.css'
import { Video, VideoPlayer, VideoSkin } from '@videojs/react/video'
import { Children, type ComponentProps, type ReactNode, isValidElement } from 'react'

import {
  AudioPlayer,
  AudioPlayerControlBar,
  AudioPlayerDurationDisplay,
  AudioPlayerElement,
  AudioPlayerMuteButton,
  AudioPlayerPlayButton,
  AudioPlayerSeekBackwardButton,
  AudioPlayerSeekForwardButton,
  AudioPlayerTimeDisplay,
  AudioPlayerTimeRange,
  AudioPlayerVolumeRange,
} from '@/components/ai-elements/audio-player'
import { cn } from '@/lib/utils'

export type MediaKind = 'image' | 'video' | 'audio'

const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogv)$/i
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac)$/i

/** What a URL points at, judged by its file extension (query and hash ignored). Unknown extensions are treated as images by `<img>` callers. */
export function mediaKindOf(url: string | undefined): MediaKind | null {
  if (!url) return null
  const path = url.split(/[?#]/)[0]
  if (VIDEO_EXT.test(path)) return 'video'
  if (AUDIO_EXT.test(path)) return 'audio'
  return null
}

export type MediaItem = { kind: MediaKind; src: string; alt?: string }

/** Video.js 10 player with the default skin. */
export function ChatVideo({ src, title }: { src: string; title?: string }) {
  return (
    <VideoPlayer>
      <VideoSkin className="overflow-hidden rounded-lg border" style={{ width: '100%', aspectRatio: '16 / 9' }}>
        <Video src={src} playsInline preload="metadata" aria-label={title} />
      </VideoSkin>
    </VideoPlayer>
  )
}

/** AI Elements audio player: play/pause, seek, time, volume. */
export function ChatAudio({ src, title }: { src: string; title?: string }) {
  return (
    <div className="rounded-lg border bg-card p-1.5">
      {title ? <div className="truncate px-2 pt-1 text-xs text-muted-foreground">{title}</div> : null}
      <AudioPlayer>
        <AudioPlayerElement src={src} preload="metadata" />
        <AudioPlayerControlBar className="flex-wrap">
          <AudioPlayerPlayButton />
          <AudioPlayerSeekBackwardButton seekOffset={10} />
          <AudioPlayerSeekForwardButton seekOffset={10} />
          <AudioPlayerTimeDisplay />
          <AudioPlayerTimeRange className="min-w-24 flex-1" />
          <AudioPlayerDurationDisplay />
          <AudioPlayerMuteButton />
          <AudioPlayerVolumeRange className="hidden sm:flex" />
        </AudioPlayerControlBar>
      </AudioPlayer>
    </div>
  )
}

function ChatImage({ src, alt, className }: { src: string; alt?: string; className?: string }) {
  return (
    <a href={src} target="_blank" rel="noreferrer" className={cn('block overflow-hidden rounded-lg border bg-muted', className)}>
      <img src={src} alt={alt ?? ''} loading="lazy" className="size-full object-cover transition-transform hover:scale-[1.02]" />
    </a>
  )
}

/**
 * Grid class by image count so the layout adapts: one image keeps its own shape, two sit side by side,
 * three put a large one beside a stacked pair, four make a square, and more flow into auto-fitting columns.
 */
function gridClass(count: number) {
  if (count === 2) return 'grid-cols-2 aspect-[2/1]'
  if (count === 3) return 'grid-cols-2 grid-rows-2 aspect-[4/3] [&>*:first-child]:row-span-2'
  if (count === 4) return 'grid-cols-2 grid-rows-2 aspect-[4/3]'
  return 'grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] auto-rows-[7.5rem]'
}

/** A set of media from one message. Images form a self-adjusting grid; each video and audio gets its own player. */
export function MediaGallery({ items }: { items: MediaItem[] }) {
  const images = items.filter((item) => item.kind === 'image')
  const others = items.filter((item) => item.kind !== 'image')
  return (
    <div className="my-2 flex flex-col gap-2">
      {images.length === 1 ? (
        <ChatImage
          src={images[0].src}
          alt={images[0].alt}
          className="max-h-96 w-fit max-w-full [&_img]:h-auto [&_img]:max-h-96 [&_img]:w-auto"
        />
      ) : images.length > 1 ? (
        <div className={cn('grid gap-1.5', gridClass(images.length))}>
          {images.map((image, index) => (
            <ChatImage key={`${image.src}-${index}`} src={image.src} alt={image.alt} />
          ))}
        </div>
      ) : null}
      {others.map((item, index) =>
        item.kind === 'video' ? (
          <ChatVideo key={`${item.src}-${index}`} src={item.src} title={item.alt} />
        ) : (
          <ChatAudio key={`${item.src}-${index}`} src={item.src} title={item.alt} />
        ),
      )}
    </div>
  )
}

/** Markdown `img`: the extension decides whether it is a picture, a video or audio. Alone it renders as a one-item gallery. */
export function MarkdownImage({ src, alt }: ComponentProps<'img'>) {
  if (typeof src !== 'string' || !src) return null
  return <MediaGallery items={[{ kind: mediaKindOf(src) ?? 'image', src, alt }]} />
}

/** Markdown `a`: links to audio or video files become players; other links stay links. */
export function MarkdownLink({ href, children }: ComponentProps<'a'>) {
  const kind = mediaKindOf(href)
  if (href && kind) return <MediaGallery items={[{ kind, src: href, alt: typeof children === 'string' ? children : undefined }]} />
  return (
    <a href={href} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
      {children}
    </a>
  )
}

/** Pulls media items out of a paragraph's children when it holds only images, media links and whitespace; otherwise null. */
export function paragraphMedia(children: ReactNode): MediaItem[] | null {
  const items: MediaItem[] = []
  for (const child of Children.toArray(children)) {
    if (typeof child === 'string') {
      if (child.trim()) return null
      continue
    }
    if (!isValidElement(child)) return null
    const props = child.props as { src?: string; href?: string; alt?: string; children?: ReactNode }
    if (child.type === MarkdownImage && props.src) {
      items.push({ kind: mediaKindOf(props.src) ?? 'image', src: props.src, alt: props.alt })
    } else if (child.type === MarkdownLink && props.href && mediaKindOf(props.href)) {
      items.push({ kind: mediaKindOf(props.href)!, src: props.href, alt: typeof props.children === 'string' ? props.children : undefined })
    } else if (child.type !== 'br') return null
  }
  return items.length > 1 ? items : null
}
