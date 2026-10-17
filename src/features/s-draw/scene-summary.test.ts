import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { describe, expect, it } from 'vitest'

import { createSceneSummary } from './scene-summary'

const shape = (id: string, extra: Record<string, unknown> = {}) =>
  ({
    id,
    type: 'rectangle',
    x: 10,
    y: 20,
    width: 100,
    height: 50,
    angle: 0,
    version: 1,
    groupIds: [],
    isDeleted: false,
    boundElements: null,
    ...extra,
  }) as unknown as ExcalidrawElement
const arrow = (extra: Record<string, unknown> = {}) =>
  shape('arrow', {
    type: 'arrow',
    points: [
      [0, 0],
      [100, 50],
    ],
    startBinding: { elementId: 'a' },
    endBinding: { elementId: 'b' },
    startArrowhead: null,
    endArrowhead: 'arrow',
    ...extra,
  })

describe('diagram relationship summaries', () => {
  it('attaches box and arrow labels using native text ownership, excluding deleted text', () => {
    const elements = [
      shape('a'),
      arrow(),
      shape('label', { type: 'text', text: 'API server', containerId: 'a' }),
      shape('edge-label', { type: 'text', text: 'request', containerId: 'arrow' }),
      shape('deleted', { type: 'text', text: 'old label', containerId: 'a', isDeleted: true }),
    ]
    const summarize = createSceneSummary(elements)
    expect(summarize(elements[0])).toMatchObject({ label: 'API server', labelLength: 10 })
    expect(summarize(elements[1])).toMatchObject({ label: 'request' })
    expect(summarize(elements[2])).toMatchObject({ containerId: 'a' })
  })

  it('preserves reverse and bidirectional arrowheads independently of point order', () => {
    for (const endArrowhead of [null, 'arrow']) {
      const edge = arrow({ startArrowhead: 'arrow', endArrowhead })
      const summarize = createSceneSummary([shape('a'), shape('b'), edge])
      expect(summarize(edge)).toMatchObject({
        start: { elementId: 'a', point: [10, 20], arrowhead: 'arrow' },
        end: { elementId: 'b', point: [110, 70], arrowhead: endArrowhead },
      })
    }
  })

  it('reports canvas endpoints for rotated and bent connectors', () => {
    const edge = arrow({
      angle: Math.PI / 2,
      points: [
        [0, 0],
        [100, 0],
        [100, 50],
      ],
    })
    expect(createSceneSummary([edge])(edge)).toMatchObject({
      start: { point: [85, -5] },
      end: { point: [35, 95] },
      pointCount: 3,
    })
  })

  it('leaves nearby unbound endpoints unbound and flags dangling bindings', () => {
    const edge = arrow({ startBinding: null })
    const result = createSceneSummary([shape('a'), edge])(edge)
    expect(result.start).toMatchObject({ elementId: null })
    expect(result.end).toMatchObject({ elementId: 'b', targetMissing: true })
    expect(result.start).not.toHaveProperty('targetMissing')
  })

  it('handles connectors drawn toward negative local coordinates when rotated', () => {
    const edge = arrow({
      angle: Math.PI / 2,
      points: [
        [0, 0],
        [-100, -50],
      ],
    })
    expect(createSceneSummary([edge])(edge)).toMatchObject({
      start: { point: [-65, 45], pointApproximate: true },
      end: { point: [-15, -55], pointApproximate: true },
    })
  })

  it('keeps escaped labels and connector references within a readable page', () => {
    const edge = arrow({
      id: 'e'.repeat(100),
      groupIds: ['g'.repeat(100), 'h'.repeat(100), 'i'.repeat(100)],
      startBinding: { elementId: 'a'.repeat(100) },
      endBinding: { elementId: 'b'.repeat(100) },
    })
    const text = shape('label', { type: 'text', text: '\u0000'.repeat(300), containerId: edge.id })
    const result = createSceneSummary([edge, text])(edge)
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(1200)
    expect(result.labelLength).toBe(300)
    expect(result.start?.elementId).toBe('a'.repeat(100))
    expect(result.end?.elementId).toBe('b'.repeat(100))
  })
})
