import { create } from 'zustand'

import type { ChatAttachment } from '@/features/note/db/types'

export type ArtifactKind = 'markdown' | 'html' | 'pdf' | 'image' | 'text' | 'docx' | 'xlsx' | 'pptx' | 'csv' | 'google'

const TEXT_EXTENSIONS = new Set(['txt', 'json', 'xml', 'yaml', 'yml', 'log', 'py', 'js', 'ts', 'tsx', 'css', 'sql', 'sh'])

const OFFICE_TYPES = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
} as const

/**
 * Google Docs, Sheets and Slides do not exist as files: Drive downloads them as small `.gdoc`, `.gsheet` and `.gslides`
 * links, and its own MIME types name them. Only the link can be shown; "File > Download" in Google gives the Office file.
 */
const GOOGLE_EXTENSIONS = new Set(['gdoc', 'gsheet', 'gslides', 'gdraw', 'gform', 'gsite', 'gmap', 'gjam'])

/** How a file can be shown in the artifact panel, or null when it can only be downloaded (an old .doc, a zip). */
export function artifactKind(file: Pick<ChatAttachment, 'name' | 'type'>): ArtifactKind | null {
  const extension = file.name.split('.').at(-1)?.toLowerCase() ?? ''
  if (file.type.startsWith('application/vnd.google-apps.') || GOOGLE_EXTENSIONS.has(extension)) return 'google'
  for (const kind of ['docx', 'xlsx', 'pptx'] as const) if (extension === kind || file.type === OFFICE_TYPES[kind]) return kind
  if (file.type === 'text/csv' || extension === 'csv') return 'csv'
  if (file.type === 'text/markdown' || extension === 'md') return 'markdown'
  if (file.type === 'text/html' || extension === 'html') return 'html'
  if (file.type === 'application/pdf') return 'pdf'
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('text/') || file.type === 'application/json' || TEXT_EXTENSIONS.has(extension)) return 'text'
  return null
}

/** A document Sensei is still writing: its text so far, shown as it arrives. `id` is the tool call that writes it. */
export interface ArtifactDraft {
  id: string
  chatId: string
  messageId: string
  name: string
  content: string
  format: 'markdown' | 'html'
}

const WIDTH_KEY = 'ask-sensei:artifact-width'
export const ARTIFACT_MIN_WIDTH = 320
const DEFAULT_WIDTH = 560

const readWidth = () => {
  try {
    return Number(localStorage.getItem(WIDTH_KEY)) || DEFAULT_WIDTH
  } catch {
    return DEFAULT_WIDTH
  }
}

interface ArtifactState {
  /** What is open on the right, and the chat it belongs to: another chat does not show it. A draft or a saved file. */
  current: { chatId: string; file?: ChatAttachment; draftId?: string } | null
  /** Documents being written right now, by tool call. */
  drafts: Record<string, ArtifactDraft>
  /** The panel is sliding out: it unmounts once the animation is done. */
  closing: boolean
  width: number
  show(file: ChatAttachment, chatId: string): void
  close(): void
  setWidth(width: number): void
  /** Sets a draft's text so far; the first call opens it in the panel. */
  writeDraft(draft: ArtifactDraft): void
  /** A draft is over: the file it became is shown by `show`, and a failed one just goes away. */
  endDraft(id: string): void
  /** Drops every draft of a reply, such as one that was stopped half way. */
  endDraftsOf(messageId: string): void
}

export const useArtifacts = create<ArtifactState>()((set) => ({
  current: null,
  drafts: {},
  closing: false,
  width: readWidth(),
  show: (file, chatId) => set({ current: { chatId, file }, closing: false }),
  close: () => set((state) => (state.current ? { closing: true } : state)),
  setWidth(width) {
    try {
      localStorage.setItem(WIDTH_KEY, String(width))
    } catch {
      // The layout is a convenience; losing it is fine.
    }
    set({ width })
  },
  writeDraft: (draft) =>
    set((state) => ({
      drafts: { ...state.drafts, [draft.id]: draft },
      // The newest document being written takes the panel, the way a new one opens when it is saved.
      current: state.drafts[draft.id] ? state.current : { chatId: draft.chatId, draftId: draft.id },
      closing: state.drafts[draft.id] ? state.closing : false,
    })),
  endDraft: (id) =>
    set((state) => {
      const { [id]: _gone, ...drafts } = state.drafts
      return { drafts, current: state.current?.draftId === id ? null : state.current }
    }),
  endDraftsOf: (messageId) =>
    set((state) => {
      const gone = Object.values(state.drafts).filter((draft) => draft.messageId === messageId)
      if (!gone.length) return state
      const drafts = Object.fromEntries(Object.entries(state.drafts).filter(([, draft]) => draft.messageId !== messageId))
      return { drafts, current: gone.some((draft) => draft.id === state.current?.draftId) ? null : state.current }
    }),
}))
