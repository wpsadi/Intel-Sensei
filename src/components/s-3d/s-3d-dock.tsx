import type { ReactNode } from 'react'
import {
  BoxIcon, ChevronDownIcon, CircleIcon, ConeIcon, CylinderIcon, FrameIcon, HandIcon, MessageCircleIcon, MousePointer2Icon,
  PenToolIcon, PentagonIcon, PlayIcon, Redo2Icon, SquareDashedIcon, SquareIcon, StarIcon, TorusIcon, TypeIcon, Undo2Icon, UploadIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuShortcut, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useS3D } from '@/features/s-3d/store'
import { cmd, runCmd } from '@/features/s-3d/commands'
import type { Shape3D, Tool } from '@/features/s-3d/types'
import { cn } from '@/lib/utils'

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

/** Floating toolbar of canvas tools at the bottom of the editor. */
export function S3DDock() {
  const tool = useS3D((s) => s.tool)
  const shape3d = useS3D((s) => s.shape3d)
  const zoom = useS3D((s) => s.camera.zoom)
  const canUndo = useS3D((s) => s.past.length > 0)
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
        <ToolButton label="Import image, video, SVG or 3D model" shortcut={cmd('import').shortcut} onClick={pick('import')}><UploadIcon /></ToolButton>
        <Separator orientation="vertical" className="mx-0.5 h-5" />
        <ToolButton label="Undo" shortcut={cmd('undo').shortcut} onClick={pick('undo')}><Undo2Icon className={cn(!canUndo && 'opacity-40')} /></ToolButton>
        <ToolButton label="Redo" shortcut={cmd('redo').shortcut} onClick={pick('redo')}><Redo2Icon className={cn(!canRedo && 'opacity-40')} /></ToolButton>
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
