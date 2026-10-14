import { FileCodeIcon, FileIcon, FileTextIcon, ImageIcon, LoaderCircleIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import type { ChatAttachment } from '@/features/note/db/types'
import { cn } from '@/lib/utils'

import { type ArtifactKind, artifactKind, useArtifacts } from './artifact.store'

const ICON: Record<ArtifactKind | 'file', typeof FileIcon> = {
  markdown: FileTextIcon,
  text: FileTextIcon,
  html: FileCodeIcon,
  image: ImageIcon,
  pdf: FileIcon,
  file: FileIcon,
}
const LABEL: Record<ArtifactKind | 'file', string> = {
  markdown: 'Document',
  text: 'Text',
  html: 'Web page',
  image: 'Image',
  pdf: 'PDF',
  file: 'File',
}

const formatSize = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`

/** Whether a file in a Sensei reply shows as an artifact card: one Sensei made, or any file the panel can open. */
export const isArtifact = (file: ChatAttachment) => !!file.artifact || (artifactKind(file) !== null && artifactKind(file) !== 'image')

function Card({
  name,
  kind,
  meta,
  busy,
  active,
  onClick,
}: {
  name: string
  kind: ArtifactKind | 'file'
  meta: string
  busy?: boolean
  active: boolean
  onClick: () => void
}) {
  const Icon = ICON[kind]
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Open ${name}`}
      className={cn(
        'flex w-full max-w-md items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left text-sm transition-colors hover:bg-muted/50',
        active && 'border-foreground/30 bg-muted/50',
      )}
    >
      {busy ? (
        <LoaderCircleIcon className="size-4 shrink-0 animate-spin text-muted-foreground" />
      ) : (
        <Icon className="size-4 shrink-0 text-muted-foreground" />
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{name}</span>
        <span className="text-xs text-muted-foreground">{LABEL[kind]}</span>
      </span>
      <Badge variant="outline" className="shrink-0 font-normal text-muted-foreground">
        {meta}
      </Badge>
    </button>
  )
}

/**
 * The documents of one reply, one card each: the ones saved, and any still being written (they fill in live in the
 * panel beside the chat). Clicking a card opens it there.
 */
export function ArtifactCards({ files, messageId, chatId }: { files: ChatAttachment[]; messageId: string; chatId: string }) {
  const drafts = useArtifacts((state) => state.drafts)
  const current = useArtifacts((state) => state.current)
  const closing = useArtifacts((state) => state.closing)
  const writing = Object.values(drafts).filter((draft) => draft.messageId === messageId)
  if (!files.length && !writing.length) return null
  return (
    <div className="mb-4 flex flex-col gap-2">
      {files.map((file) => (
        <Card
          key={file.src}
          name={file.name}
          kind={artifactKind(file) ?? 'file'}
          meta={formatSize(file.size)}
          active={!closing && current?.file?.src === file.src}
          // The open one closes; any other one takes the panel.
          onClick={() => (!closing && current?.file?.src === file.src ? useArtifacts.getState().close() : useArtifacts.getState().show(file, chatId))}
        />
      ))}
      {writing.map((draft) => (
        <Card
          key={draft.id}
          name={draft.name}
          kind={draft.format}
          meta={`Writing… ${draft.content.split('\n').length} lines`}
          busy
          active={!closing && current?.draftId === draft.id}
          onClick={() =>
            !closing && current?.draftId === draft.id
              ? useArtifacts.getState().close()
              : useArtifacts.setState({ current: { chatId, draftId: draft.id }, closing: false })
          }
        />
      ))}
    </div>
  )
}
