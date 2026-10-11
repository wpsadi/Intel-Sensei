import { ScrollArea } from '@/components/ui/scroll-area'
import { Node, mergeAttributes } from '@tiptap/core'
import { NodeViewContent, type NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import { PlusIcon, XIcon } from 'lucide-react'
import { useState } from 'react'
import { IconPicker } from '../../components/IconPicker'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { PageIcon } from './pages'
import { cn } from '@/lib/utils'

/* --------------------------------- callout -------------------------------- */

const CALLOUT_COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red']

function CalloutView({ node, updateAttributes }: NodeViewProps) {
  const { icon, color } = node.attrs as { icon: string; color: string }
  const [picking, setPicking] = useState(false)
  return (
    <NodeViewWrapper className={cn('snote-callout my-1 flex gap-2 rounded-md px-4 py-3', `snote-bg-${color}`)}>
      <div contentEditable={false} className="shrink-0">
        {/* The popover is anchored to this icon and flips / shifts to stay inside the viewport. */}
        <Popover
          open={picking}
          onOpenChange={(open, details) => {
            const event = details.event as MouseEvent | undefined
            if (open && event?.shiftKey) {
              updateAttributes({ color: CALLOUT_COLORS[(CALLOUT_COLORS.indexOf(color) + 1) % CALLOUT_COLORS.length] })
              return
            }
            setPicking(open)
          }}
        >
          <PopoverTrigger
            render={<button type="button" className="flex h-6 items-center text-lg leading-6" title="Change icon (shift-click: color)" />}
          >
            <PageIcon icon={icon} className="text-lg leading-6" />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto rounded-md p-0">
            <IconPicker
              onPick={(next) => {
                updateAttributes({ icon: next })
                setPicking(false)
              }}
            />
          </PopoverContent>
        </Popover>
      </div>
      <NodeViewContent className="min-w-0 flex-1" />
    </NodeViewWrapper>
  )
}

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,
  draggable: true,
  addAttributes() {
    return { icon: { default: '💡' }, color: { default: 'gray' } }
  },
  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'callout' }), 0]
  },
  addNodeView() {
    return ReactNodeViewRenderer(CalloutView)
  },
})

/* --------------------------------- columns -------------------------------- */

export const Column = Node.create({
  name: 'column',
  content: 'block+',
  isolating: true,
  parseHTML() {
    return [{ tag: 'div[data-type="column"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'column', class: 'snote-column' }), 0]
  },
})

export const Columns = Node.create({
  name: 'columns',
  group: 'block',
  content: 'column{2,5}',
  draggable: true,
  isolating: true,
  parseHTML() {
    return [{ tag: 'div[data-type="columns"]' }]
  },
  renderHTML({ HTMLAttributes, node }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'columns',
        class: 'snote-columns',
        style: `grid-template-columns: repeat(${node.childCount}, minmax(0, 1fr))`,
      }),
      0,
    ]
  },
})

export const columnsContent = (count: number) => ({
  type: 'columns',
  content: Array.from({ length: count }, () => ({ type: 'column', content: [{ type: 'paragraph' }] })),
})

/* ---------------------------------- tabs ---------------------------------- */

export const TabPanel = Node.create({
  name: 'tabPanel',
  content: 'block+',
  isolating: true,
  addAttributes() {
    return { title: { default: 'Tab' } }
  },
  parseHTML() {
    return [{ tag: 'div[data-type="tab-panel"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'tab-panel', class: 'snote-tab-panel' }), 0]
  },
})

function TabsView({ node, updateAttributes, editor, getPos }: NodeViewProps) {
  const active = Math.min(node.attrs.active as number, node.childCount - 1)
  const titles: string[] = []
  node.forEach((child) => titles.push(child.attrs.title as string))

  /** Position of the n-th tab panel inside the document. */
  const panelPos = (index: number) => {
    let pos = (getPos() ?? 0) + 1
    for (let i = 0; i < index; i++) pos += node.child(i).nodeSize
    return pos
  }

  const rename = (index: number, title: string) =>
    editor.view.dispatch(editor.state.tr.setNodeAttribute(panelPos(index), 'title', title))

  const add = () => {
    const pos = panelPos(node.childCount)
    editor
      .chain()
      .insertContentAt(pos, { type: 'tabPanel', attrs: { title: `Tab ${node.childCount + 1}` }, content: [{ type: 'paragraph' }] })
      .run()
    updateAttributes({ active: node.childCount })
  }

  const remove = (index: number) => {
    if (node.childCount <= 1) return
    const from = panelPos(index)
    editor.view.dispatch(editor.state.tr.delete(from, from + node.child(index).nodeSize))
    updateAttributes({ active: Math.max(0, active - (index <= active ? 1 : 0)) })
  }

  return (
    <NodeViewWrapper className="snote-tabs my-2 rounded-md border" data-active={active}>
      <ScrollArea className="border-b">
        <div className="flex items-center gap-1 px-1 pt-1">
        {titles.map((title, index) => (
          <div
            key={index}
            className={cn(
              'group/tab flex items-center rounded-t-md border-b-2 px-2 py-1 text-sm',
              index === active ? 'border-foreground' : 'border-transparent text-muted-foreground hover:bg-muted',
            )}
            onClick={() => updateAttributes({ active: index })}
          >
            <input
              value={title}
              onChange={(event) => rename(index, event.target.value)}
              size={Math.max(title.length, 3)}
              className="bg-transparent outline-none"
            />
            <button type="button" onClick={() => remove(index)} className="ml-1 opacity-0 group-hover/tab:opacity-60">
              <XIcon className="size-3" />
            </button>
          </div>
        ))}
        <button type="button" onClick={add} className="rounded p-1 text-muted-foreground hover:bg-muted" title="Add tab">
          <PlusIcon className="size-4" />
        </button>
        </div>
      </ScrollArea>
      <NodeViewContent className="snote-tab-panels px-3 py-2" />
    </NodeViewWrapper>
  )
}

export const Tabs = Node.create({
  name: 'tabs',
  group: 'block',
  content: 'tabPanel+',
  draggable: true,
  isolating: true,
  addAttributes() {
    return { active: { default: 0 } }
  },
  parseHTML() {
    return [{ tag: 'div[data-type="tabs"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'tabs' }), 0]
  },
  addNodeView() {
    return ReactNodeViewRenderer(TabsView)
  },
})

export const tabsContent = () => ({
  type: 'tabs',
  attrs: { active: 0 },
  content: ['Tab 1', 'Tab 2'].map((title) => ({ type: 'tabPanel', attrs: { title }, content: [{ type: 'paragraph' }] })),
})
