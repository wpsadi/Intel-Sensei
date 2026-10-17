import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'

/** Keep the agent's initial context and paginated reads consistent about diagram relationships. */
export function createSceneSummary(elements: readonly ExcalidrawElement[]) {
  const visible = elements.filter((element) => !element.isDeleted)
  const byId = new Map(visible.map((element) => [element.id, element]))
  const labels = new Map<string, string[]>()
  for (const element of visible) {
    if (element.type === 'text' && element.containerId) {
      const texts = labels.get(element.containerId) ?? []
      texts.push(element.text)
      labels.set(element.containerId, texts)
    }
  }
  return (element: ExcalidrawElement) => {
    const texts =
      labels.get(element.id) ??
      (element.boundElements ?? []).flatMap((binding) => {
        const text = byId.get(binding.id)
        return binding.type === 'text' && text?.type === 'text' ? [text.text] : []
      })
    const label = texts.join('\n')
    const linear = element.type === 'arrow' || element.type === 'line' ? element : null
    const endpoint = (end: 'start' | 'end') => {
      if (!linear) return null
      const point = linear.points[end === 'start' ? 0 : linear.points.length - 1]
      const binding = end === 'start' ? linear.startBinding : linear.endBinding
      // Linear points are local to the element and rotate around its bounding-box center.
      const xs = linear.points.map((point) => point[0])
      const ys = linear.points.map((point) => point[1])
      const cx = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0
      const cy = ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0
      const dx = (point?.[0] ?? 0) - cx
      const dy = (point?.[1] ?? 0) - cy
      const cos = Math.cos(linear.angle)
      const sin = Math.sin(linear.angle)
      return {
        elementId: binding?.elementId ?? null,
        ...(binding && !byId.has(binding.elementId) ? { targetMissing: true } : {}),
        point: [
          Math.round((linear.x + cx + dx * cos - dy * sin) * 100) / 100,
          Math.round((linear.y + cy + dx * sin + dy * cos) * 100) / 100,
        ],
        ...(linear.angle ? { pointApproximate: true } : {}),
        arrowhead: (end === 'start' ? linear.startArrowhead : linear.endArrowhead) ?? null,
      }
    }
    const summary = {
      id: element.id,
      type: element.type,
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      angle: element.angle,
      version: element.version,
      ...('text' in element ? { text: element.text.slice(0, 100), textLength: element.text.length } : {}),
      ...(label ? { label: label.slice(0, 100), labelLength: label.length } : {}),
      ...(element.frameId ? { frameId: element.frameId } : {}),
      ...('containerId' in element && element.containerId ? { containerId: element.containerId } : {}),
      ...(element.groupIds?.length ? { groupIds: element.groupIds.slice(0, 3) } : {}),
      ...(linear ? { start: endpoint('start'), end: endpoint('end'), pointCount: linear.points.length } : {}),
    }
    while (JSON.stringify(summary).length > 1200 && (summary.text?.length || summary.label?.length)) {
      if (summary.text) summary.text = summary.text.slice(0, Math.floor(summary.text.length / 2))
      if (summary.label) summary.label = summary.label.slice(0, Math.floor(summary.label.length / 2))
    }
    return summary
  }
}

export const DRAW_RELATIONSHIP_GUIDANCE =
  'Shape and arrow labels come from bound text; text.containerId identifies its owner. Connector start/end include bound elementId, canvas point and arrowhead. An end arrowhead means start→end; a start arrowhead means end→start; heads at both ends mean bidirectional. A null elementId is unbound: proximity or crossing alone does not establish a connection. Resolve endpoint IDs with sdraw_read_elements, read full fields for truncated labels or paths, and use sdraw_capture_view to verify visual relationships before editing. Rotated connector points are approximate. After creating or moving elements, run sdraw_check_layout and repair unintended text overflow, arrow obstructions and connector overlaps, then capture again.'
