import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'

type Point = readonly [number, number]
type Rect = { x: number; y: number; width: number; height: number }
export interface LayoutIssue {
  kind:
    | 'label_outside_box'
    | 'unbound_box_text'
    | 'arrow_through_content'
    | 'arrows_overlap'
    | 'arrows_cross'
    | 'boxes_overlap'
    | 'text_overlap'
    | 'duplicate_element'
  ids: string[]
}
const boxTypes = new Set(['rectangle', 'diamond', 'ellipse'])
const cross = (a: Point, b: Point) => a[0] * b[1] - a[1] * b[0]
const subtract = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]]
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1])
function segmentContact(a: Point, b: Point, c: Point, d: Point) {
  const r = subtract(b, a),
    s = subtract(d, c),
    delta = subtract(c, a)
  const denominator = cross(r, s)
  if (Math.abs(denominator) < 0.0001) {
    if (Math.abs(cross(delta, r)) > 0.0001 || distance(a, b) < 0.001) return null
    const axis = Math.abs(r[0]) >= Math.abs(r[1]) ? 0 : 1
    const overlap =
      Math.min(Math.max(a[axis], b[axis]), Math.max(c[axis], d[axis])) - Math.max(Math.min(a[axis], b[axis]), Math.min(c[axis], d[axis]))
    return overlap > 6 ? 'overlap' : null
  }
  const t = cross(delta, s) / denominator,
    u = cross(delta, r) / denominator
  if (t < 0 || t > 1 || u < 0 || u > 1) return null
  const point: Point = [a[0] + t * r[0], a[1] + t * r[1]]
  // Two arrows are allowed to meet at a common endpoint.
  if (Math.min(distance(point, a), distance(point, b)) < 2 && Math.min(distance(point, c), distance(point, d)) < 2) return null
  return 'cross'
}
function segmentThroughRect(a: Point, b: Point, rect: Rect) {
  // Clip the segment against the interior, excluding mere boundary contact.
  const left = rect.x + 1,
    right = rect.x + rect.width - 1
  const top = rect.y + 1,
    bottom = rect.y + rect.height - 1
  if (left >= right || top >= bottom) return false
  let lo = 0,
    hi = 1
  for (const [start, change, min, max] of [
    [a[0], b[0] - a[0], left, right],
    [a[1], b[1] - a[1], top, bottom],
  ]) {
    if (Math.abs(change) < 0.0001) {
      if (start < min || start > max) return false
    } else {
      const t1 = (min - start) / change,
        t2 = (max - start) / change
      lo = Math.max(lo, Math.min(t1, t2))
      hi = Math.min(hi, Math.max(t1, t2))
      if (lo > hi) return false
    }
  }
  return hi - lo > 0.001
}
function overlaps(a: Rect, b: Rect) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}
const near = (a: number, b: number) => Math.abs(a - b) <= 1
const sameRect = (a: Rect, b: Rect) => near(a.x, b.x) && near(a.y, b.y) && near(a.width, b.width) && near(a.height, b.height)
/** One shape drawn around another is grouping, not a collision. */
const inside = (inner: Rect, outer: Rect) =>
  inner.x >= outer.x - 1 &&
  inner.y >= outer.y - 1 &&
  inner.x + inner.width <= outer.x + outer.width + 1 &&
  inner.y + inner.height <= outer.y + outer.height + 1
const overlapSize = (a: Rect, b: Rect) => ({
  width: Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
  height: Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
})

/** Advisory checks for ordinary axis-aligned diagrams. Never mutate or silently reroute a user's drawing. */
export function checkDrawLayout(elements: readonly ExcalidrawElement[], maxComparisons = 50_000) {
  const visible = elements.filter((element) => !element.isDeleted)
  const byId = new Map(visible.map((element) => [element.id, element]))
  const issues: LayoutIssue[] = []
  const dedupe = new Set<string>()
  let comparisons = 0
  let complete = true
  const add = (kind: LayoutIssue['kind'], ...ids: string[]) => {
    const key = `${kind}:${ids.join(':')}`
    if (!dedupe.has(key)) {
      issues.push({ kind, ids })
      dedupe.add(key)
    }
  }
  const boxes = visible.filter((element) => boxTypes.has(element.type) && !element.angle)
  const texts = visible.filter((element) => element.type === 'text' && !element.angle)
  const arrows = visible.filter((element) => (element.type === 'arrow' || element.type === 'line') && !element.angle)
  const spend = () => {
    if (++comparisons <= maxComparisons) return true
    complete = false
    return false
  }
  for (const text of texts) {
    if (text.type !== 'text') continue
    const owner = text.containerId ? byId.get(text.containerId) : undefined
    if (owner && boxTypes.has(owner.type) && !owner.angle) {
      if (
        text.x < owner.x - 1 ||
        text.y < owner.y - 1 ||
        text.x + text.width > owner.x + owner.width + 1 ||
        text.y + text.height > owner.y + owner.height + 1
      )
        add('label_outside_box', text.id, owner.id)
    } else if (!text.containerId) {
      for (const box of boxes) {
        if (!spend()) break
        if (overlaps(text, box)) add('unbound_box_text', text.id, box.id)
      }
    }
  }
  // Shapes that run into each other, or that are drawn twice in the same place.
  for (let i = 0; i < boxes.length && complete; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (!spend()) break
      const a = boxes[i],
        b = boxes[j]
      if (a.type === b.type && sameRect(a, b)) {
        add('duplicate_element', a.id, b.id)
        continue
      }
      if (!overlaps(a, b) || inside(a, b) || inside(b, a)) continue
      // Edges that only touch are not a collision.
      const { width, height } = overlapSize(a, b)
      if (width >= 2 && height >= 2) add('boxes_overlap', a.id, b.id)
    }
  }
  // Text on top of other text, or the same words twice in the same place.
  for (let i = 0; i < texts.length && complete; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      if (!spend()) break
      const a = texts[i],
        b = texts[j]
      if (a.type !== 'text' || b.type !== 'text') continue
      if (a.text && a.text === b.text && sameRect(a, b)) {
        add('duplicate_element', a.id, b.id)
        continue
      }
      if (!overlaps(a, b)) continue
      const { width, height } = overlapSize(a, b)
      const smaller = Math.min(a.width * a.height, b.width * b.height)
      if (smaller > 0 && (width * height) / smaller > 0.25) add('text_overlap', a.id, b.id)
    }
  }
  for (let i = 0; i < arrows.length && complete; i++) {
    const arrow = arrows[i]
    if (arrow.type !== 'arrow' && arrow.type !== 'line') continue
    const points = arrow.points.map(([x, y]): Point => [arrow.x + x, arrow.y + y])
    for (const obstacle of [...boxes, ...texts]) {
      if (!complete) break
      if (
        obstacle.id === arrow.startBinding?.elementId ||
        obstacle.id === arrow.endBinding?.elementId ||
        (obstacle.type === 'text' &&
          (obstacle.containerId === arrow.id ||
            obstacle.containerId === arrow.startBinding?.elementId ||
            obstacle.containerId === arrow.endBinding?.elementId))
      )
        continue
      for (let p = 1; p < points.length; p++) {
        if (!spend()) break
        if (segmentThroughRect(points[p - 1], points[p], obstacle)) {
          add('arrow_through_content', arrow.id, obstacle.id)
          break
        }
      }
    }
    for (let j = i + 1; j < arrows.length && complete; j++) {
      const other = arrows[j]
      if (other.type !== 'arrow' && other.type !== 'line') continue
      let found = false
      for (let p = 1; p < points.length && complete && !found; p++) {
        for (let q = 1; q < other.points.length; q++) {
          if (!spend()) break
          const contact = segmentContact(
            points[p - 1],
            points[p],
            [other.x + other.points[q - 1][0], other.y + other.points[q - 1][1]],
            [other.x + other.points[q][0], other.y + other.points[q][1]],
          )
          if (contact) {
            add(contact === 'overlap' ? 'arrows_overlap' : 'arrows_cross', arrow.id, other.id)
            found = true
            break
          }
        }
      }
    }
  }
  return {
    issues,
    complete,
    rotatedElementsSkipped: visible.filter((element) => element.angle).length,
    note: 'Advisory geometry check: curved paths and nonrectangular shapes use approximate bounds. Intentional crossings may be valid. Confirm with a rendered capture.',
  }
}
