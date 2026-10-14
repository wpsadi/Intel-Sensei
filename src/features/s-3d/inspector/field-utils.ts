import { useS3D } from '../store'
import type { SNode } from '../types'

export const MIXED = 'mixed' as const
export type Maybe<T> = T | typeof MIXED

/** The selected nodes, re-rendering when any of them changes. */
export function useSelectedNodes() {
  const selection = useS3D((s) => s.selection)
  const nodes = useS3D((s) => s.doc.nodes)
  return selection.map((id) => nodes[id]).filter(Boolean) as SNode[]
}

/** A shared value across nodes, or MIXED. */
export function shared<T>(nodes: SNode[], pick: (n: SNode) => T): Maybe<T> {
  if (!nodes.length) return MIXED
  const first = JSON.stringify(pick(nodes[0]))
  return nodes.every((n) => JSON.stringify(pick(n)) === first) ? pick(nodes[0]) : MIXED
}

export const update = (ids: string[], patch: Partial<SNode> | ((n: SNode) => void)) => useS3D.getState().updateNodes(ids, patch)

export const normHex = (hex: string) => {
  let h = hex.replace('#', '').trim()
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  return /^[0-9a-f]{6}$/i.test(h) ? `#${h.toLowerCase()}` : null
}

/** Moves an item within an array; returns a new array. */
export function moveItem<T>(arr: T[], from: number, to: number) {
  const next = [...arr]
  const [x] = next.splice(from, 1)
  next.splice(Math.max(0, Math.min(to, next.length)), 0, x)
  return next
}
