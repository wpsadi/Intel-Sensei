import { GripVerticalIcon, MessageSquareIcon, PlusIcon } from 'lucide-react'
import { useRef } from 'react'
import { useDrag } from 'react-dnd'
import { BLOCK_DRAG, type BlockHover, type DraggedBlock } from './block-dom'

interface BlockHandleProps {
  hover: BlockHover
  onAdd: () => void
  onOpenActions: () => void
  onDragEnd: () => void
  commentCount: number
  onOpenComments: () => void
}

/** Notion-style gutter handle for one block: "+" adds a block below, the grip opens block actions. Both drag the block. */
export function BlockHandle({ hover, onAdd, onOpenActions, onDragEnd, commentCount, onOpenComments }: BlockHandleProps) {
  // The drag item is read when a drag starts, so it must see the latest hovered block.
  const hoverRef = useRef(hover)
  hoverRef.current = hover
  const source = () => ({
    type: BLOCK_DRAG,
    item: (): DraggedBlock => ({
      start: hoverRef.current.start,
      size: hoverRef.current.size,
    }),
    end: onDragEnd,
  })
  const [, plusDragRef] = useDrag(source, [onDragEnd])
  const [, gripDragRef] = useDrag(source, [onDragEnd])

  return (
    // Top-aligned so tall blocks (databases, media) keep the handles at their first line, not the middle.
    <div
      className="absolute z-10 flex -translate-x-full items-start gap-0.5 pt-[3px] pr-1 text-muted-foreground"
      style={{ top: hover.top, left: hover.left, height: hover.height }}
    >
      <button
        ref={(node) => {
          plusDragRef(node)
        }}
        type="button"
        title="Add block below · drag to move"
        onClick={onAdd}
        className="cursor-grab rounded p-0.5 hover:bg-muted"
      >
        <PlusIcon className="size-4" />
      </button>
      <button
        ref={(node) => {
          gripDragRef(node)
        }}
        type="button"
        title="Drag to move · click for options"
        onClick={onOpenActions}
        className="cursor-grab rounded p-0.5 hover:bg-muted"
      >
        <GripVerticalIcon className="size-4" />
      </button>
      {commentCount > 0 && (
        <button
          type="button"
          title="Open comments"
          onClick={onOpenComments}
          className="flex items-center gap-0.5 rounded p-0.5 text-xs text-amber-600 hover:bg-muted"
        >
          <MessageSquareIcon className="size-3.5" />
          {commentCount}
        </button>
      )}
    </div>
  )
}
