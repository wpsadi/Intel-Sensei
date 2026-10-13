import type { ReactNode } from 'react'
import {
  ArrowLeftRightIcon, BandageIcon, BoxIcon, BoxSelectIcon, BrushIcon, ChevronDownIcon, CircleDashedIcon, CircleIcon, ConeIcon, CropIcon, CylinderIcon, EraserIcon, FrameIcon,
  HandIcon, HistoryIcon, LassoIcon, SlidersHorizontalIcon, MessageCircleIcon, MousePointer2Icon, PenToolIcon, PentagonIcon, PipetteIcon, PlayIcon, Redo2Icon, SquareDashedIcon, SquareIcon,
  StampIcon, StarIcon, TorusIcon, TypeIcon, Undo2Icon, UploadIcon, WandIcon, WandSparklesIcon, ZoomInIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuShortcut, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useS3D } from '@/features/s-3d/store'
import { cmd, runCmd } from '@/features/s-3d/commands'
import { BRUSH_TOOLS } from './raster/canvas-tools'
import type { Shape3D, Tool } from '@/features/s-3d/types'
import { cn } from '@/lib/utils'
import { ColorPicker } from '@/components/s-3d/color-picker'

const SHAPES: { tool: Tool; label: string; icon: ReactNode; cmd: string }[] = [
  { tool: 'rect', label: 'Rectangle', icon: <SquareIcon />, cmd: 'tool-rect' },
  { tool: 'ellipse', label: 'Ellipse', icon: <CircleIcon />, cmd: 'tool-ellipse' },
  { tool: 'polygon', label: 'Polygon', icon: <PentagonIcon />, cmd: 'tool-polygon' },
  { tool: 'star', label: 'Star', icon: <StarIcon />, cmd: 'tool-star' },
]
const SHAPES_3D: { kind: Shape3D; label: string; icon: ReactNode }[] = [
  { kind: 'cube', label: 'Cube', icon: <BoxIcon /> },
  { kind: 'sphere', label: 'Sphere', icon: <CircleIcon /> },
  { kind: 'torus', label: 'Torus', icon: <TorusIcon /> },
  { kind: 'cylinder', label: 'Cylinder', icon: <CylinderIcon /> },
  { kind: 'cone', label: 'Cone', icon: <ConeIcon /> },
  { kind: 'torusKnot', label: 'Torus knot', icon: <TorusIcon /> },
]

function ToolButton({ active, label, shortcut, onClick, children }: { active?: boolean; label: string; shortcut?: string; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant={active ? 'default' : 'ghost'} size="icon-xs" aria-label={label} aria-pressed={active} onClick={onClick} />}>
        {children}
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {label} {shortcut && <span className="ml-1 opacity-60">{shortcut}</span>}
      </TooltipContent>
    </Tooltip>
  )
}

const PAINT: { tool: Tool; cmd: string; label: string; icon: ReactNode }[] = [
  { tool: 'brush', cmd: 'tool-brush', label: 'Brush', icon: <BrushIcon /> },
  { tool: 'eraser', cmd: 'tool-eraser', label: 'Eraser', icon: <EraserIcon /> },
  { tool: 'clone', cmd: 'tool-clone', label: 'Clone stamp', icon: <StampIcon /> },
  { tool: 'heal', cmd: 'tool-heal', label: 'Spot healing', icon: <BandageIcon /> },
]
const SELECTIONS: { tool: Tool; cmd: string; label: string; icon: ReactNode }[] = [
  { tool: 'marquee', cmd: 'tool-marquee', label: 'Marquee', icon: <BoxSelectIcon /> },
  { tool: 'marquee', cmd: 'tool-marquee-ellipse', label: 'Elliptical marquee', icon: <CircleDashedIcon /> },
  { tool: 'lasso', cmd: 'tool-lasso', label: 'Lasso', icon: <LassoIcon /> },
  { tool: 'wand', cmd: 'tool-wand', label: 'Magic wand', icon: <WandIcon /> },
  { tool: 'quick', cmd: 'tool-quick', label: 'Quick selection', icon: <WandSparklesIcon /> },
]

/** A tool with a dropdown of alternatives, like the shape picker. */
function ToolGroup({ items, tool, label }: { items: typeof PAINT; tool: Tool; label: string }) {
  const current = items.find((x) => x.tool === tool) ?? items[0]
  return (
    <div className="flex items-center">
      <ToolButton active={items.some((x) => x.tool === tool)} label={current.label} shortcut={cmd(current.cmd).shortcut} onClick={() => runCmd(current.cmd)}>{current.icon}</ToolButton>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" className="w-3.5" aria-label={label} />}><ChevronDownIcon className="size-3!" /></DropdownMenuTrigger>
        <DropdownMenuContent side="top" className="w-44 normal-case">
          {items.map((x) => (
            <DropdownMenuItem key={x.tool} className="normal-case tracking-normal" onClick={() => runCmd(x.cmd)}>
              {x.icon}{x.label}<DropdownMenuShortcut>{cmd(x.cmd).shortcut}</DropdownMenuShortcut>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/** Brush size, hardness and opacity, in a popover so the toolbar stays compact. */
function BrushOptions() {
  const brush = useS3D((s) => s.brush)
  const set = useS3D((s) => s.set)
  const rows: { key: 'size' | 'hardness' | 'opacity'; label: string; min: number; max: number; unit: string }[] = [
    { key: 'size', label: 'Size', min: 1, max: 300, unit: 'px' },
    { key: 'hardness', label: 'Hardness', min: 0, max: 100, unit: '%' },
    { key: 'opacity', label: 'Opacity', min: 1, max: 100, unit: '%' },
  ]
  const value = (key: 'size' | 'hardness' | 'opacity') => (key === 'size' ? brush.size : Math.round(brush[key] * 100))
  const update = (key: 'size' | 'hardness' | 'opacity', v: number) => set({ brush: { ...brush, [key]: key === 'size' ? v : v / 100 } })
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="ghost" size="icon-xs" aria-label="Brush options" />}><SlidersHorizontalIcon /></PopoverTrigger>
      <PopoverContent side="top" className="w-60 gap-3 p-3">
        <span className="text-xs font-medium">Brush</span>
        {rows.map((r) => (
          <label key={r.key} className="grid gap-1 text-xs text-muted-foreground">
            <span className="flex justify-between tabular-nums"><span>{r.label}</span><span>{value(r.key)}{r.unit}</span></span>
            <input aria-label={`Brush ${r.label.toLowerCase()}`} type="range" min={r.min} max={r.max} value={value(r.key)} onChange={(e) => update(r.key, +e.target.value)} className="accent-primary" />
          </label>
        ))}
      </PopoverContent>
    </Popover>
  )
}

/** Foreground and background colours (click to pick, X swaps them) and brush options for the painting tools. */
function PixelControls() {
  const tool = useS3D((s) => s.tool)
  const fg = useS3D((s) => s.foregroundColor)
  const bg = useS3D((s) => s.backgroundColor)
  const set = useS3D((s) => s.set)
  return (
    <div className="flex items-center gap-0.5">
      <Separator orientation="vertical" className="mx-0.5 h-5" />
      <div className="relative size-8 shrink-0">
        <ColorPicker label="Background colour" value={bg} onChange={(c) => set({ backgroundColor: c })} className="absolute bottom-0 right-0" />
        <ColorPicker label="Foreground colour" value={fg} onChange={(c) => set({ foregroundColor: c })} className="absolute left-0 top-0" />
      </div>
      <ToolButton label="Swap colours" shortcut={cmd('swap-colors').shortcut} onClick={() => runCmd('swap-colors')}><ArrowLeftRightIcon /></ToolButton>
      {BRUSH_TOOLS.includes(tool) && <BrushOptions />}
    </div>
  )
}

/** Undo and redo history: each entry names the edit it reverts or repeats, and jumps to that point. */
function HistoryMenu() {
  const labels = useS3D((s) => s.historyLabels)
  const redo = useS3D((s) => s.redoLabels)
  const step = (kind: 'undo' | 'redo', count: number) => {
    const st = useS3D.getState()
    for (let i = 0; i < count; i++) st[kind]()
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label="History" />}><HistoryIcon /></DropdownMenuTrigger>
      <DropdownMenuContent side="top" className="max-h-72 w-56 overflow-y-auto normal-case">
        {labels.length === 0 && redo.length === 0 && <DropdownMenuItem disabled>No edits yet</DropdownMenuItem>}
        {redo.map((label, k) => (
          <DropdownMenuItem key={`redo-${k}`} className="normal-case tracking-normal" onClick={() => step('redo', k + 1)}>Redo {label}</DropdownMenuItem>
        ))}
        {labels.map((label, i) => (
          <DropdownMenuItem key={`undo-${i}`} className="normal-case tracking-normal" onClick={() => step('undo', labels.length - i)}>Before {label}</DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Floating toolbar of canvas tools at the bottom of the editor. */
export function DesignDock() {
  const tool = useS3D((s) => s.tool)
  const shape3d = useS3D((s) => s.shape3d)
  const zoom = useS3D((s) => s.camera.zoom)
  const canUndo = useS3D((s) => s.past.length > 0)
  const fg = useS3D((s) => s.foregroundColor)
  const canRedo = useS3D((s) => s.future.length > 0)
  const set = useS3D((s) => s.set)
  const shape = SHAPES.find((x) => x.tool === tool) ?? SHAPES[0]
  const pick = (id: string) => () => runCmd(id)

  return (
    <TooltipProvider>
      <div data-ui className="flex items-center gap-0.5 rounded-xl border bg-background/95 p-1 shadow-lg backdrop-blur [&_svg]:size-4">
        <ToolButton active={tool === 'select'} label="Move" shortcut="V" onClick={pick('tool-select')}><MousePointer2Icon /></ToolButton>
        <ToolButton active={tool === 'hand'} label="Hand" shortcut="H" onClick={pick('tool-hand')}><HandIcon /></ToolButton>
        <Separator orientation="vertical" className="mx-0.5 h-5" />
        <ToolButton active={tool === 'frame'} label="Frame" shortcut="F" onClick={pick('tool-frame')}><FrameIcon /></ToolButton>
        <ToolButton active={tool === 'section'} label="Section" shortcut={cmd('tool-section').shortcut} onClick={pick('tool-section')}><SquareDashedIcon /></ToolButton>
        <div className="flex items-center">
          <ToolButton active={SHAPES.some((x) => x.tool === tool)} label={shape.label} shortcut={cmd(shape.cmd).shortcut} onClick={pick(shape.cmd)}>{shape.icon}</ToolButton>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" className="w-3.5" aria-label="Shapes" />}><ChevronDownIcon className="size-3!" /></DropdownMenuTrigger>
            <DropdownMenuContent side="top" className="w-44 normal-case">
              {SHAPES.map((x) => (
                <DropdownMenuItem key={x.tool} className="normal-case tracking-normal" onClick={pick(x.cmd)}>
                  {x.icon}{x.label}<DropdownMenuShortcut>{cmd(x.cmd).shortcut}</DropdownMenuShortcut>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <ToolButton active={tool === 'pen'} label="Pen" shortcut="P" onClick={pick('tool-pen')}><PenToolIcon /></ToolButton>
        <ToolButton active={tool === 'text'} label="Text" shortcut="T" onClick={pick('tool-text')}><TypeIcon /></ToolButton>
        <div className="flex items-center">
          <ToolButton active={tool === 'shape3d'} label={`3D ${shape3d}`} shortcut="K" onClick={pick('tool-3d')}>{SHAPES_3D.find((x) => x.kind === shape3d)?.icon}</ToolButton>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" className="w-3.5" aria-label="3D shapes" />}><ChevronDownIcon className="size-3!" /></DropdownMenuTrigger>
            <DropdownMenuContent side="top" className="w-40">
              {SHAPES_3D.map((x) => (
                <DropdownMenuItem key={x.kind} className="normal-case tracking-normal" onClick={() => set({ shape3d: x.kind, tool: 'shape3d', selection: [] })}>{x.icon}{x.label}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <ToolButton active={tool === 'comment'} label="Comment" shortcut="C" onClick={pick('tool-comment')}><MessageCircleIcon /></ToolButton>
        <Separator orientation="vertical" className="mx-0.5 h-5" />
        <ToolGroup items={PAINT} tool={tool} label="Paint options" />
        <ToolGroup items={SELECTIONS} tool={tool} label="Selection options" />
        <ToolButton active={tool === 'crop'} label="Crop" shortcut={cmd('tool-crop').shortcut} onClick={pick('tool-crop')}><CropIcon /></ToolButton>
        <ToolButton active={tool === 'eyedropper'} label="Eyedropper" shortcut={cmd('tool-eyedropper').shortcut} onClick={pick('tool-eyedropper')}><PipetteIcon style={{ color: fg }} /></ToolButton>
        <ToolButton active={tool === 'zoom'} label="Zoom tool" shortcut={cmd('tool-zoom').shortcut} onClick={pick('tool-zoom')}><ZoomInIcon /></ToolButton>
        <PixelControls />
        <ToolButton label="Import image, video, SVG or 3D model" shortcut={cmd('import').shortcut} onClick={pick('import')}><UploadIcon /></ToolButton>
        <Separator orientation="vertical" className="mx-0.5 h-5" />
        <ToolButton label="Undo" shortcut={cmd('undo').shortcut} onClick={pick('undo')}><Undo2Icon className={cn(!canUndo && 'opacity-40')} /></ToolButton>
        <ToolButton label="Redo" shortcut={cmd('redo').shortcut} onClick={pick('redo')}><Redo2Icon className={cn(!canRedo && 'opacity-40')} /></ToolButton>
        <HistoryMenu />
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="h-7 w-14 px-1 text-xs tabular-nums" />}>{Math.round(zoom * 100)}%</DropdownMenuTrigger>
          <DropdownMenuContent side="top" className="w-44">
            {['zoom-in', 'zoom-out', 'zoom-fit', 'zoom-selection', 'zoom-100'].map((id) => (
              <DropdownMenuItem key={id} className="normal-case tracking-normal" onClick={pick(id)}>{cmd(id).label}<DropdownMenuShortcut>{cmd(id).shortcut}</DropdownMenuShortcut></DropdownMenuItem>
            ))}
            {[0.5, 2].map((z) => <DropdownMenuItem key={z} className="normal-case tracking-normal" onClick={() => useS3D.getState().zoomTo(z)}>Zoom to {z * 100}%</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
        <ToolButton label="Preview / Play" shortcut={cmd('play').shortcut} onClick={pick('play')}><PlayIcon /></ToolButton>
      </div>
    </TooltipProvider>
  )
}
