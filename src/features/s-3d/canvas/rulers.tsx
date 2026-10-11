import { useS3D } from '../store'
import type { Rect } from '../model'

const STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000]
const SIZE = 18

/** Top and left rulers in world units, with the selection's extent highlighted. */
export function Rulers({ selection }: { selection: Rect | null }) {
  const camera = useS3D((s) => s.camera)
  const viewport = useS3D((s) => s.viewport)
  const step = STEPS.find((st) => st * camera.zoom >= 60) ?? 10000
  const ticks = (length: number, offset: number) => {
    const start = Math.floor(-offset / camera.zoom / step) * step
    const out: number[] = []
    for (let v = start; v * camera.zoom + offset < length; v += step) out.push(v)
    return out
  }
  return (
    <div data-ui className="pointer-events-none text-[9px] text-muted-foreground tabular-nums">
      <svg className="absolute top-0 left-0 bg-background/90" width={viewport.w} height={SIZE} style={{ borderBottom: '1px solid var(--border)' }}>
        {selection && <rect x={selection.x * camera.zoom + camera.x} y={0} width={selection.w * camera.zoom} height={SIZE} fill="rgba(13,153,255,.15)" />}
        {ticks(viewport.w, camera.x).map((v) => {
          const x = v * camera.zoom + camera.x
          return (
            <g key={v}>
              <line x1={x} x2={x} y1={SIZE - 6} y2={SIZE} stroke="currentColor" />
              <text x={x + 3} y={10} fill="currentColor">{v}</text>
            </g>
          )
        })}
      </svg>
      <svg className="absolute top-0 left-0 bg-background/90" width={SIZE} height={viewport.h} style={{ borderRight: '1px solid var(--border)' }}>
        {selection && <rect y={selection.y * camera.zoom + camera.y} x={0} height={selection.h * camera.zoom} width={SIZE} fill="rgba(13,153,255,.15)" />}
        {ticks(viewport.h, camera.y).map((v) => {
          const y = v * camera.zoom + camera.y
          return (
            <g key={v}>
              <line y1={y} y2={y} x1={SIZE - 6} x2={SIZE} stroke="currentColor" />
              <text x={10} y={y + 3} fill="currentColor" transform={`rotate(-90 10 ${y + 3})`}>{v}</text>
            </g>
          )
        })}
      </svg>
      <div className="absolute top-0 left-0 bg-background" style={{ width: SIZE, height: SIZE }} />
    </div>
  )
}
