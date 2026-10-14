import { createContext } from 'react'

import type { Doc, SNode } from '../types'

export interface RenderCtx {
  doc: Doc
  play: boolean
  editingTextId?: string | null
  /** Play mode: node id -> active state id. */
  states?: Record<string, string>
  /** Play mode: node id -> running animation name. */
  anims?: Record<string, string>
  hidden?: Record<string, boolean>
  onTrigger?: (node: SNode, trigger: 'click' | 'hover') => void
  onTextCommit?: (id: string, content: string) => void
  onTextMeasure?: (id: string, w: number, h: number) => void
}

export const RenderContext = createContext<RenderCtx>({
  doc: { id: '', name: '', pages: [], nodes: {}, createdAt: 0, updatedAt: 0 },
  play: false,
})
