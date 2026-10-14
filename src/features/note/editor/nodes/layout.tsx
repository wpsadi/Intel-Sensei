import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'

import { CalloutView, TabsView } from './views/layout'

/* --------------------------------- callout -------------------------------- */

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
