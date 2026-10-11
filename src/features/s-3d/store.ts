import { create } from 'zustand'
import { produce } from 'immer'
import { docsRepo, settingsRepo, uid, versionsRepo } from './db'
import {
  absPos, absRect, applyAutoLayout, applyConstraints, childrenOf, cloneSubtrees, createDoc, createNode, createPage, descendants,
  isContainer, pageOf, setChildren, unionRect,
} from './model'
import type { BooleanOp, Doc, Service, NodeType, Page, SNode, Shape3D, Tool } from './types'

export const CLIENT_ID = uid()
const CLIENT_NAME = `Guest ${CLIENT_ID.slice(0, 4)}`
const HISTORY_LIMIT = 200

export interface Camera {
  x: number
  y: number
  zoom: number
}

export interface Peer {
  id: string
  name: string
  color: string
  x: number
  y: number
  pageId: string
  selection: string[]
  seen: number
}

interface S3DState {
  ready: boolean
  doc: Doc
  docs: { id: string; name: string; updatedAt: number }[]
  pageId: string
  selection: string[]
  hovered: string | null
  editingTextId: string | null
  /** The 3D scene open in the full-screen scene editor, with its selected object and gizmo mode. */
  sceneEdit: { nodeId: string; selected: string | null; gizmo: 'translate' | 'rotate' | 'scale' } | null
  tool: Tool
  shape3d: Shape3D
  camera: Camera
  viewport: { w: number; h: number }
  snapToGrid: boolean
  gridSize: number
  showRulers: boolean
  showGrid: boolean
  mode: 'edit' | 'play'
  leftTab: 'layers' | 'agent'
  saving: 'saved' | 'saving' | 'unsaved'
  past: Doc[]
  future: Doc[]
  peers: Record<string, Peer>
  clipboard: { nodes: Record<string, SNode>; roots: string[] } | null

  /** The service whose files are open; S-Design and S3D keep separate file lists. */
  service: Service
  init(service: Service): Promise<void>
  set(patch: Partial<S3DState>): void
  /** Applies a recipe to the document. `history: false` skips the undo stack (for in-progress drags). */
  mutate(recipe: (doc: Doc) => void, opts?: { history?: boolean }): void
  /** Starts a gesture whose transient mutations collapse into one undo step on `endGesture`. */
  beginGesture(): void
  endGesture(): void
  undo(): void
  redo(): void

  newDoc(name?: string): Promise<void>
  openDoc(id: string): Promise<void>
  loadDoc(doc: Doc): Promise<void>
  deleteDoc(id: string): Promise<void>
  renameDoc(name: string): void
  saveNow(label?: string): Promise<void>
  restoreVersion(doc: Doc): void

  addPage(): void
  renamePage(id: string, name: string): void
  duplicatePage(id: string): void
  deletePage(id: string): void
  movePage(id: string, index: number): void
  setPage(id: string): void

  addNode(type: NodeType, patch?: Partial<SNode>, parentId?: string, index?: number): SNode
  addNodes(nodes: Record<string, SNode>, roots: string[], parentId?: string): void
  updateNodes(ids: string[], patch: Partial<SNode> | ((n: SNode) => void)): void
  deleteNodes(ids: string[]): void
  duplicate(ids?: string[]): void
  moveNode(id: string, parentId: string, index: number): void
  group(ids?: string[], type?: 'group' | 'frame' | 'boolean', op?: BooleanOp): void
  ungroup(ids?: string[]): void
  arrange(dir: 'forward' | 'backward' | 'front' | 'back'): void
  align(kind: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom' | 'hdistribute' | 'vdistribute'): void
  flip(axis: 'h' | 'v'): void
  copy(): void
  cut(): void
  paste(): void

  select(ids: string[], additive?: boolean): void
  selectAll(): void
  zoomTo(zoom: number, cx?: number, cy?: number): void
  zoomToFit(ids?: string[]): void
}

const emptyDoc = createDoc()

/** The frame/section under (x, y) on the page that a new node should be parented to. */
export function containerAt(doc: Doc, pageId: string, x: number, y: number, exclude: string[] = []): string {
  const hit = (parentId: string): string | null => {
    const kids = [...childrenOf(doc, parentId)].reverse()
    for (const id of kids) {
      const n = doc.nodes[id]
      if (!n || !n.visible || exclude.includes(id) || !(n.type === 'frame' || n.type === 'section')) continue
      const r = absRect(doc, id)
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return hit(id) ?? id
    }
    return null
  }
  return hit(pageId) ?? pageId
}

/* ---------- collaboration: same-origin tabs over BroadcastChannel, last-writer-wins per node ---------- */

type CollabMessage =
  | { kind: 'doc'; from: string; doc: Doc; deleted: string[] }
  | { kind: 'presence'; from: string; peer: Peer }
  | { kind: 'leave'; from: string }

const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('s3d-collab')
const PEER_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899']
export const myColor = PEER_COLORS[parseInt(CLIENT_ID.slice(0, 2), 16) % PEER_COLORS.length]

function mergeDocs(local: Doc, remote: Doc, deleted: string[]): Doc {
  return produce(local, (d) => {
    for (const id of deleted) delete d.nodes[id]
    for (const [id, rn] of Object.entries(remote.nodes)) {
      const ln = d.nodes[id]
      if (!ln || rn.rev > ln.rev || (rn.rev === ln.rev && rn.editedBy > ln.editedBy)) d.nodes[id] = rn
    }
    if (remote.updatedAt >= local.updatedAt) {
      d.pages = remote.pages
      d.name = remote.name
    }
    // Repair structure: every node listed exactly once in its parent's children.
    const all = new Set(Object.keys(d.nodes))
    for (const p of d.pages) p.children = p.children.filter((c) => all.has(c) && d.nodes[c].parentId === p.id)
    for (const n of Object.values(d.nodes)) n.children = n.children.filter((c) => all.has(c) && d.nodes[c].parentId === n.id)
    for (const n of Object.values(d.nodes)) {
      const siblings = childrenOf(d, n.parentId)
      if (!siblings.includes(n.id)) {
        if (d.nodes[n.parentId] || d.pages.some((p) => p.id === n.parentId)) setChildren(d, n.parentId, [...siblings, n.id])
        else delete d.nodes[n.id]
      }
    }
    d.updatedAt = Math.max(local.updatedAt, remote.updatedAt)
  })
}

let listening = false
const lastDocKey = (service: Service) => (service === 'design' ? 'lastDocId' : `lastDocId:${service}`)
const serviceDocs = async (service: Service) => (await docsRepo.list()).filter((d) => (d.kind ?? 'design') === service)

let saveTimer: ReturnType<typeof setTimeout> | undefined
let versionTimer = 0
let gestureBase: Doc | null = null

export const useS3D = create<S3DState>()((set, get) => {
  const scheduleSave = () => {
    set({ saving: 'unsaved' })
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => void get().saveNow(), 700)
  }

  const commit = (next: Doc, prev: Doc, history: boolean) => {
    if (next === prev) return
    const deleted = Object.keys(prev.nodes).filter((id) => !next.nodes[id])
    set((s) => ({
      doc: next,
      past: history ? [...s.past, prev].slice(-HISTORY_LIMIT) : s.past,
      future: history ? [] : s.future,
      selection: s.selection.filter((id) => next.nodes[id]),
    }))
    channel?.postMessage({ kind: 'doc', from: CLIENT_ID, doc: next, deleted } satisfies CollabMessage)
    scheduleSave()
  }

  /** Runs a recipe, re-runs auto layout and stamps changed nodes with a new revision. */
  const apply = (doc: Doc, recipe: (d: Doc) => void) =>
    produce(doc, (d) => {
      recipe(d)
      applyAutoLayout(d)
      d.updatedAt = Date.now()
    })

  const stamp = (prev: Doc, next: Doc) =>
    produce(next, (d) => {
      for (const [id, n] of Object.entries(next.nodes)) {
        if (prev.nodes[id] !== n) {
          d.nodes[id].rev = (prev.nodes[id]?.rev ?? 0) + 1
          d.nodes[id].editedBy = CLIENT_ID
        }
      }
    })

  const sel = (ids?: string[]) => ids ?? get().selection

  return {
    ready: false,
    service: 'design',
    doc: emptyDoc,
    docs: [],
    pageId: emptyDoc.pages[0].id,
    selection: [],
    hovered: null,
    editingTextId: null,
    sceneEdit: null,
    tool: 'select',
    shape3d: 'cube',
    camera: { x: 0, y: 0, zoom: 1 },
    viewport: { w: 800, h: 600 },
    snapToGrid: false,
    gridSize: 8,
    showRulers: true,
    showGrid: true,
    mode: 'edit',
    leftTab: 'layers',
    saving: 'saved',
    past: [],
    future: [],
    peers: {},
    clipboard: null,

    async init(service) {
      if (get().ready && get().service === service) return
      const first = !listening
      listening = true
      if (get().ready && get().saving !== 'saved') await get().saveNow()
      set({ ready: false, service, sceneEdit: null, mode: 'edit' })
      const docs = (await docsRepo.list()).filter((d) => (d.kind ?? 'design') === service)
      const lastId = await settingsRepo.get<string>(lastDocKey(service), '')
      const doc = docs.find((d) => d.id === lastId) ?? docs[0]
      if (doc) await get().loadDoc(doc)
      else await get().newDoc('Untitled')
      set({ ready: true })
      if (!first) return
      channel?.addEventListener('message', (e: MessageEvent<CollabMessage>) => {
        const msg = e.data
        if (msg.kind === 'presence') set((s) => ({ peers: { ...s.peers, [msg.from]: msg.peer } }))
        else if (msg.kind === 'leave') set((s) => { const peers = { ...s.peers }; delete peers[msg.from]; return { peers } })
        else if (msg.kind === 'doc' && msg.doc.id === get().doc.id) set({ doc: mergeDocs(get().doc, msg.doc, msg.deleted) })
      })
      window.addEventListener('beforeunload', () => channel?.postMessage({ kind: 'leave', from: CLIENT_ID }))
    },

    set: (patch) => set(patch),

    mutate(recipe, opts) {
      const prev = get().doc
      const next = stamp(prev, apply(prev, recipe))
      commit(next, prev, opts?.history !== false && !gestureBase)
    },
    beginGesture() {
      gestureBase = get().doc
    },
    endGesture() {
      const base = gestureBase
      gestureBase = null
      if (base && base !== get().doc) set((s) => ({ past: [...s.past, base].slice(-HISTORY_LIMIT), future: [] }))
    },
    undo() {
      const { past, doc } = get()
      const prev = past.at(-1)
      if (!prev) return
      set((s) => ({ doc: prev, past: s.past.slice(0, -1), future: [doc, ...s.future] }))
      if (!prev.pages.some((p) => p.id === get().pageId)) set({ pageId: prev.pages[0].id })
      set((s) => ({ selection: s.selection.filter((id) => prev.nodes[id]) }))
      channel?.postMessage({ kind: 'doc', from: CLIENT_ID, doc: prev, deleted: Object.keys(doc.nodes).filter((id) => !prev.nodes[id]) })
      scheduleSave()
    },
    redo() {
      const { future, doc } = get()
      const next = future[0]
      if (!next) return
      set((s) => ({ doc: next, future: s.future.slice(1), past: [...s.past, doc] }))
      if (!next.pages.some((p) => p.id === get().pageId)) set({ pageId: next.pages[0].id })
      channel?.postMessage({ kind: 'doc', from: CLIENT_ID, doc: next, deleted: Object.keys(doc.nodes).filter((id) => !next.nodes[id]) })
      scheduleSave()
    },

    async newDoc(name = 'Untitled') {
      await get().loadDoc({ ...createDoc(name), kind: get().service })
      await get().saveNow()
    },
    async openDoc(id) {
      const doc = await docsRepo.get(id)
      if (doc) await get().loadDoc(doc)
    },
    async loadDoc(doc) {
      if (get().saving !== 'saved' && get().ready) await get().saveNow()
      set({ doc, pageId: doc.pages[0].id, selection: [], past: [], future: [], camera: { x: 0, y: 0, zoom: 1 }, editingTextId: null })
      await settingsRepo.set(lastDocKey(get().service), doc.id)
      set({ docs: (await serviceDocs(get().service)).map(({ id, name, updatedAt }) => ({ id, name, updatedAt })) })
      requestAnimationFrame(() => get().zoomToFit())
    },
    async deleteDoc(id) {
      await docsRepo.remove(id)
      const docs = await serviceDocs(get().service)
      if (id === get().doc.id) {
        if (docs[0]) await get().loadDoc(docs[0])
        else await get().newDoc()
      }
      set({ docs: (await serviceDocs(get().service)).map(({ id, name, updatedAt }) => ({ id, name, updatedAt })) })
    },
    renameDoc(name) {
      get().mutate((d) => void (d.name = name))
    },
    async saveNow(label) {
      clearTimeout(saveTimer)
      set({ saving: 'saving' })
      const doc = get().doc
      await docsRepo.put(doc)
      // A snapshot every 10 minutes of editing, plus every manual save.
      if (label || Date.now() - versionTimer > 10 * 60_000) {
        versionTimer = Date.now()
        await versionsRepo.add(doc, label ?? 'Autosave')
      }
      set({ saving: 'saved', docs: (await serviceDocs(get().service)).map(({ id, name, updatedAt }) => ({ id, name, updatedAt })) })
    },
    restoreVersion(version) {
      const prev = get().doc
      const next = produce(version, (d) => {
        d.id = prev.id
        d.updatedAt = Date.now()
      })
      commit(next, prev, true)
      set({ pageId: next.pages[0].id, selection: [] })
    },

    addPage() {
      const page = createPage(`Page ${get().doc.pages.length + 1}`)
      get().mutate((d) => void d.pages.push(page))
      set({ pageId: page.id, selection: [] })
    },
    renamePage(id, name) {
      get().mutate((d) => {
        const p = d.pages.find((x) => x.id === id)
        if (p) p.name = name
      })
    },
    duplicatePage(id) {
      const doc = get().doc
      const page = doc.pages.find((p) => p.id === id)
      if (!page) return
      const copy: Page = { ...page, id: uid(), name: `${page.name} copy`, children: [] }
      const { roots, nodes } = cloneSubtrees(doc.nodes, page.children, copy.id)
      copy.children = roots
      get().mutate((d) => {
        Object.assign(d.nodes, nodes)
        d.pages.splice(d.pages.indexOf(d.pages.find((p) => p.id === id)!) + 1, 0, copy)
      })
      set({ pageId: copy.id, selection: [] })
    },
    deletePage(id) {
      const doc = get().doc
      if (doc.pages.length < 2) return
      get().mutate((d) => {
        const page = d.pages.find((p) => p.id === id)!
        for (const root of page.children) for (const nid of [root, ...descendants(d, root)]) delete d.nodes[nid]
        d.pages = d.pages.filter((p) => p.id !== id)
      })
      if (get().pageId === id) set({ pageId: get().doc.pages[0].id, selection: [] })
    },
    movePage(id, index) {
      get().mutate((d) => {
        const from = d.pages.findIndex((p) => p.id === id)
        const [p] = d.pages.splice(from, 1)
        d.pages.splice(Math.max(0, Math.min(index, d.pages.length)), 0, p)
      })
    },
    setPage(id) {
      set({ pageId: id, selection: [], editingTextId: null, sceneEdit: null })
      requestAnimationFrame(() => get().zoomToFit())
    },

    addNode(type, patch = {}, parentId, index) {
      const parent = parentId ?? get().pageId
      const node = createNode(type, parent, patch)
      get().mutate((d) => {
        d.nodes[node.id] = node
        const kids = [...childrenOf(d, parent)]
        kids.splice(index ?? kids.length, 0, node.id)
        setChildren(d, parent, kids)
      })
      return node
    },
    addNodes(nodes, roots, parentId) {
      const parent = parentId ?? get().pageId
      get().mutate((d) => {
        Object.assign(d.nodes, nodes)
        for (const r of roots) d.nodes[r].parentId = parent
        setChildren(d, parent, [...childrenOf(d, parent), ...roots])
      })
    },
    updateNodes(ids, patch) {
      get().mutate((d) => {
        for (const id of ids) {
          const n = d.nodes[id]
          if (!n) continue
          const { w: oldW, h: oldH } = n
          if (typeof patch === 'function') patch(n)
          else Object.assign(n, structuredClone(patch))
          if (isContainer(n) && (n.w !== oldW || n.h !== oldH)) applyConstraints(d, n, oldW, oldH)
        }
      })
    },
    deleteNodes(ids) {
      if (!ids.length) return
      get().mutate((d) => {
        for (const id of ids) {
          const n = d.nodes[id]
          if (!n) continue
          setChildren(d, n.parentId, childrenOf(d, n.parentId).filter((c) => c !== id))
          for (const nid of [id, ...descendants(d, id)]) delete d.nodes[nid]
        }
      })
      set({ selection: [] })
    },
    duplicate(ids) {
      const doc = get().doc
      const targets = sel(ids).filter((id) => doc.nodes[id])
      if (!targets.length) return
      const { roots, nodes } = cloneSubtrees(doc.nodes, targets)
      get().mutate((d) => {
        Object.assign(d.nodes, nodes)
        roots.forEach((r, i) => {
          const n = d.nodes[r]
          n.name = `${n.name} copy`
          if (!d.nodes[n.parentId]?.autoLayout) {
            n.x += 16
            n.y += 16
          }
          const kids = [...childrenOf(d, n.parentId)]
          kids.splice(kids.indexOf(targets[i]) + 1, 0, r)
          setChildren(d, n.parentId, kids)
        })
      })
      set({ selection: roots })
    },
    moveNode(id, parentId, index) {
      const doc = get().doc
      if (id === parentId || descendants(doc, id).includes(parentId)) return
      get().mutate((d) => {
        const n = d.nodes[id]
        const abs = absPos(d, id)
        setChildren(d, n.parentId, childrenOf(d, n.parentId).filter((c) => c !== id))
        const kids = [...childrenOf(d, parentId)]
        kids.splice(Math.max(0, Math.min(index, kids.length)), 0, id)
        setChildren(d, parentId, kids)
        n.parentId = parentId
        // Keep the node where it was on screen.
        const pAbs = d.nodes[parentId] ? absPos(d, parentId) : { x: 0, y: 0 }
        n.x = abs.x - pAbs.x
        n.y = abs.y - pAbs.y
      })
    },
    group(ids, type = 'group', op = 'union') {
      const doc = get().doc
      const targets = sel(ids).filter((id) => doc.nodes[id])
      if (!targets.length) return
      const parent = doc.nodes[targets[0]].parentId
      const siblings = childrenOf(doc, parent)
      const ordered = siblings.filter((s) => targets.includes(s))
      if (!ordered.length) return
      const box = unionRect(ordered.map((id) => absRect(doc, id)))!
      const pAbs = doc.nodes[parent] ? absPos(doc, parent) : { x: 0, y: 0 }
      const g = createNode(type, parent, { x: box.x - pAbs.x, y: box.y - pAbs.y, w: box.w, h: box.h, children: ordered, booleanOp: op, ...(type === 'frame' ? { fills: [] } : {}) })
      if (type === 'boolean') g.name = op[0].toUpperCase() + op.slice(1)
      get().mutate((d) => {
        d.nodes[g.id] = g
        const firstIdx = childrenOf(d, parent).indexOf(ordered.at(-1)!)
        const kids = childrenOf(d, parent).filter((c) => !ordered.includes(c))
        kids.splice(Math.min(firstIdx - ordered.length + 1, kids.length), 0, g.id)
        setChildren(d, parent, kids)
        for (const id of ordered) {
          d.nodes[id].parentId = g.id
          d.nodes[id].x -= g.x
          d.nodes[id].y -= g.y
        }
      })
      set({ selection: [g.id] })
    },
    ungroup(ids) {
      const doc = get().doc
      const groups = sel(ids).filter((id) => doc.nodes[id] && isContainer(doc.nodes[id]) && doc.nodes[id].children.length)
      if (!groups.length) return
      const released: string[] = []
      get().mutate((d) => {
        for (const gid of groups) {
          const g = d.nodes[gid]
          const kids = [...childrenOf(d, g.parentId)]
          const at = kids.indexOf(gid)
          kids.splice(at, 1, ...g.children)
          setChildren(d, g.parentId, kids)
          for (const c of g.children) {
            d.nodes[c].parentId = g.parentId
            d.nodes[c].x += g.x
            d.nodes[c].y += g.y
            released.push(c)
          }
          delete d.nodes[gid]
        }
      })
      set({ selection: released })
    },
    arrange(dir) {
      const ids = get().selection
      get().mutate((d) => {
        for (const id of ids) {
          const n = d.nodes[id]
          if (!n) continue
          const kids = [...childrenOf(d, n.parentId)]
          const i = kids.indexOf(id)
          kids.splice(i, 1)
          const to = dir === 'front' ? kids.length : dir === 'back' ? 0 : dir === 'forward' ? Math.min(kids.length, i + 1) : Math.max(0, i - 1)
          kids.splice(to, 0, id)
          setChildren(d, n.parentId, kids)
        }
      })
    },
    align(kind) {
      const doc = get().doc
      const ids = get().selection.filter((id) => doc.nodes[id])
      if (!ids.length) return
      // A single node aligns to its parent frame.
      const rects = ids.map((id) => ({ id, ...absRect(doc, id) }))
      const single = ids.length === 1 && doc.nodes[doc.nodes[ids[0]].parentId]
      const box = single ? absRect(doc, doc.nodes[ids[0]].parentId) : unionRect(rects)!
      get().mutate((d) => {
        const move = (id: string, ax: number | null, ay: number | null) => {
          const r = rects.find((x) => x.id === id)!
          if (ax !== null) d.nodes[id].x += ax - r.x
          if (ay !== null) d.nodes[id].y += ay - r.y
        }
        if (kind === 'hdistribute' || kind === 'vdistribute') {
          const horiz = kind === 'hdistribute'
          const sorted = [...rects].sort((a, b) => (horiz ? a.x - b.x : a.y - b.y))
          const total = sorted.reduce((s, r) => s + (horiz ? r.w : r.h), 0)
          const gap = ((horiz ? box.w : box.h) - total) / Math.max(1, sorted.length - 1)
          let cur = horiz ? box.x : box.y
          for (const r of sorted) {
            move(r.id, horiz ? cur : null, horiz ? null : cur)
            cur += (horiz ? r.w : r.h) + gap
          }
          return
        }
        for (const r of rects) {
          if (kind === 'left') move(r.id, box.x, null)
          if (kind === 'right') move(r.id, box.x + box.w - r.w, null)
          if (kind === 'hcenter') move(r.id, box.x + (box.w - r.w) / 2, null)
          if (kind === 'top') move(r.id, null, box.y)
          if (kind === 'bottom') move(r.id, null, box.y + box.h - r.h)
          if (kind === 'vcenter') move(r.id, null, box.y + (box.h - r.h) / 2)
        }
      })
    },
    flip(axis) {
      get().updateNodes(get().selection, (n) => {
        if (n.type === 'vector') {
          n.path = n.path.replace(/(-?\d*\.?\d+),(-?\d*\.?\d+)/g, (_, x, y) => (axis === 'h' ? `${(n.w - Number(x)).toFixed(2)},${y}` : `${x},${(n.h - Number(y)).toFixed(2)}`))
        } else n.rotation = axis === 'h' ? -n.rotation : 180 - n.rotation
      })
    },
    copy() {
      const doc = get().doc
      const roots = get().selection.filter((id) => doc.nodes[id])
      if (!roots.length) return
      const nodes: Record<string, SNode> = {}
      for (const r of roots) for (const id of [r, ...descendants(doc, r)]) nodes[id] = structuredClone(doc.nodes[id])
      // Store absolute positions on roots so they paste in place regardless of parent.
      for (const r of roots) Object.assign(nodes[r], absPos(doc, r))
      set({ clipboard: { nodes, roots } })
      void navigator.clipboard?.writeText(JSON.stringify({ s3d: true, nodes, roots })).catch(() => {})
    },
    cut() {
      get().copy()
      get().deleteNodes(get().selection)
    },
    paste() {
      const clip = get().clipboard
      if (!clip) return
      const doc = get().doc
      const selected = get().selection.length === 1 ? doc.nodes[get().selection[0]] : null
      const parent = selected && (selected.type === 'frame' || selected.type === 'section') ? selected.id : get().pageId
      const { roots, nodes } = cloneSubtrees(clip.nodes, clip.roots, parent)
      const pAbs = doc.nodes[parent] ? absPos(doc, parent) : { x: 0, y: 0 }
      for (const r of roots) {
        nodes[r].x -= pAbs.x - (parent === get().pageId ? 16 : 0)
        nodes[r].y -= pAbs.y - (parent === get().pageId ? 16 : 0)
      }
      get().addNodes(nodes, roots, parent)
      set({ selection: roots })
    },

    select(ids, additive) {
      if (!additive) return set({ selection: ids, editingTextId: null })
      const cur = new Set(get().selection)
      for (const id of ids) {
        if (cur.has(id)) cur.delete(id)
        else cur.add(id)
      }
      set({ selection: [...cur] })
    },
    selectAll() {
      const doc = get().doc
      const parent = get().selection[0] ? doc.nodes[get().selection[0]]?.parentId : get().pageId
      set({ selection: childrenOf(doc, parent ?? get().pageId).filter((id) => !doc.nodes[id]?.locked) })
    },
    zoomTo(zoom, cx, cy) {
      const { camera, viewport } = get()
      const z = Math.max(0.02, Math.min(64, zoom))
      const sx = cx ?? viewport.w / 2
      const sy = cy ?? viewport.h / 2
      const wx = (sx - camera.x) / camera.zoom
      const wy = (sy - camera.y) / camera.zoom
      set({ camera: { zoom: z, x: sx - wx * z, y: sy - wy * z } })
    },
    zoomToFit(ids) {
      const { doc, pageId, viewport } = get()
      const page = doc.pages.find((p) => p.id === pageId)
      const targets = ids ?? page?.children ?? []
      const box = unionRect(targets.filter((id) => doc.nodes[id]).map((id) => absRect(doc, id)))
      if (!box) return set({ camera: { x: viewport.w / 2, y: viewport.h / 2, zoom: 1 } })
      const zoom = Math.min(4, Math.min((viewport.w - 120) / box.w, (viewport.h - 120) / box.h))
      set({ camera: { zoom, x: viewport.w / 2 - (box.x + box.w / 2) * zoom, y: viewport.h / 2 - (box.y + box.h / 2) * zoom } })
    },
  }
})

export function broadcastPresence(x: number, y: number) {
  const { pageId, selection } = useS3D.getState()
  channel?.postMessage({ kind: 'presence', from: CLIENT_ID, peer: { id: CLIENT_ID, name: CLIENT_NAME, color: myColor, x, y, pageId, selection, seen: Date.now() } } satisfies CollabMessage)
}

export const currentPage = (s: Pick<S3DState, 'doc' | 'pageId'>) => s.doc.pages.find((p) => p.id === s.pageId) ?? s.doc.pages[0]
export { pageOf }

// Handy for debugging from the console in development.
if (import.meta.env.DEV) (window as unknown as { __s3d: typeof useS3D }).__s3d = useS3D
