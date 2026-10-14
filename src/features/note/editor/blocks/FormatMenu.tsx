import { NodeSelection } from '@tiptap/pm/state'
import { type Editor, useEditorState } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { BaselineIcon, BoldIcon, CodeIcon, ItalicIcon, LinkIcon, StrikethroughIcon, UnderlineIcon } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/lib/utils'

const TEXT_COLORS = [
  { name: 'Gray', value: '#6b7280' },
  { name: 'Brown', value: '#92400e' },
  { name: 'Orange', value: '#ea580c' },
  { name: 'Yellow', value: '#ca8a04' },
  { name: 'Green', value: '#16a34a' },
  { name: 'Blue', value: '#2563eb' },
  { name: 'Purple', value: '#9333ea' },
  { name: 'Pink', value: '#db2777' },
  { name: 'Red', value: '#dc2626' },
]

const HIGHLIGHTS = [
  { name: 'Gray', value: '#e5e7eb' },
  { name: 'Brown', value: '#fde68a' },
  { name: 'Orange', value: '#fed7aa' },
  { name: 'Yellow', value: '#fef08a' },
  { name: 'Green', value: '#bbf7d0' },
  { name: 'Blue', value: '#bfdbfe' },
  { name: 'Purple', value: '#e9d5ff' },
  { name: 'Pink', value: '#fbcfe8' },
  { name: 'Red', value: '#fecaca' },
]

/** Inline formatting toolbar shown over a text selection. */
export function FormatMenu({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      code: e.isActive('code'),
      link: e.isActive('link'),
      highlight: e.isActive('highlight'),
      color: (e.getAttributes('textStyle').color as string | undefined) ?? '',
      background: (e.getAttributes('highlight').color as string | undefined) ?? '',
    }),
  })

  const [palette, setPalette] = useState(false)

  const buttons = [
    {
      key: 'bold',
      icon: BoldIcon,
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      key: 'italic',
      icon: ItalicIcon,
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      key: 'underline',
      icon: UnderlineIcon,
      run: () => editor.chain().focus().toggleUnderline().run(),
    },
    {
      key: 'strike',
      icon: StrikethroughIcon,
      run: () => editor.chain().focus().toggleStrike().run(),
    },
    {
      key: 'code',
      icon: CodeIcon,
      run: () => editor.chain().focus().toggleCode().run(),
    },
    {
      key: 'link',
      icon: LinkIcon,
      run: () => {
        if (state.link) return editor.chain().focus().unsetLink().run()
        const href = window.prompt('Link URL')
        if (href) editor.chain().focus().setLink({ href }).run()
      },
    },
  ] as const

  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({ editor: e, state: s }) =>
        !s.selection.empty && !(s.selection instanceof NodeSelection) && e.isEditable && !e.isActive('codeBlock')
      }
      className="relative flex items-center gap-0.5 rounded-lg border bg-popover p-1 shadow-lg"
    >
      {buttons.map(({ key, icon: Icon, run }) => (
        <button
          key={key}
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={run}
          className={cn('rounded p-1.5 hover:bg-muted', state[key] && 'bg-muted text-blue-500')}
        >
          <Icon className="size-4" />
        </button>
      ))}
      <span className="mx-1 h-5 w-px bg-border" />
      <button
        type="button"
        title="Text color & highlight"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setPalette((open) => !open)}
        className={cn('rounded p-1.5 hover:bg-muted', palette && 'bg-muted')}
      >
        <BaselineIcon className="size-4" style={{ color: state.color || undefined }} />
      </button>
      {palette && (
        <div className="absolute top-full left-0 mt-1 w-56 rounded-lg border bg-popover p-2 shadow-lg">
          <Swatches
            label="Text color"
            colors={TEXT_COLORS}
            current={state.color}
            onPick={(value) => editor.chain().focus().setColor(value).run()}
            onReset={() => editor.chain().focus().unsetColor().run()}
            render={(value) => (
              <span className="text-sm font-semibold" style={{ color: value }}>
                A
              </span>
            )}
          />
          <Swatches
            label="Highlight"
            colors={HIGHLIGHTS}
            current={state.background}
            onPick={(value) => editor.chain().focus().setHighlight({ color: value }).run()}
            onReset={() => editor.chain().focus().unsetHighlight().run()}
            render={(value) => <span className="size-full rounded-sm" style={{ background: value }} />}
          />
        </div>
      )}
    </BubbleMenu>
  )
}

/** One row of color choices, with a "default" swatch that clears the color. */
function Swatches({
  label,
  colors,
  current,
  onPick,
  onReset,
  render,
}: {
  label: string
  colors: { name: string; value: string }[]
  current: string
  onPick: (value: string) => void
  onReset: () => void
  render: (value: string) => React.ReactNode
}) {
  const swatch = 'flex size-6 items-center justify-center rounded border hover:ring-2 hover:ring-ring'
  return (
    <div className="mb-2 last:mb-0">
      <div className="mb-1 text-xs font-medium text-muted-foreground">{label}</div>
      <div className="grid grid-cols-5 gap-1.5">
        <button
          type="button"
          title="Default"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onReset}
          className={cn(swatch, !current && 'ring-2 ring-ring')}
        >
          <span className="text-sm">A</span>
        </button>
        {colors.map(({ name, value }) => (
          <button
            key={value}
            type="button"
            title={name}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(value)}
            className={cn(swatch, 'p-0.5', current === value && 'ring-2 ring-ring')}
          >
            {render(value)}
          </button>
        ))}
      </div>
    </div>
  )
}
