import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { describe, expect, it } from 'vitest'

import { checkDrawLayout } from './layout-check'

const shape = (id: string, extra: Record<string, unknown> = {}) =>
  ({
    id,
    type: 'rectangle',
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    angle: 0,
    isDeleted: false,
    ...extra,
  }) as unknown as ExcalidrawElement
const arrow = (id: string, points: number[][], extra: Record<string, unknown> = {}) => shape(id, { type: 'arrow', points, ...extra })

describe('diagram layout checks', () => {
  it('finds overflow and unbound box text without flagging a contained bound label', () => {
    const result = checkDrawLayout([
      shape('box'),
      shape('fits', { type: 'text', x: 10, y: 10, width: 80, height: 20, containerId: 'box' }),
      shape('overflow', { type: 'text', x: 80, y: 10, width: 80, height: 20, containerId: 'box' }),
      shape('unbound', { type: 'text', x: 10, y: 10, width: 80, height: 20, containerId: null }),
    ])
    expect(result.issues).toEqual([
      { kind: 'label_outside_box', ids: ['overflow', 'box'] },
      { kind: 'unbound_box_text', ids: ['unbound', 'box'] },
    ])
  })

  it('detects arrows through unrelated boxes and text while allowing native endpoint containers and owned labels', () => {
    const result = checkDrawLayout([
      shape('source'),
      shape('target', { x: 300 }),
      shape('obstacle', { x: 150, width: 50 }),
      shape('owned-label', { type: 'text', x: 100, y: 10, width: 40, height: 20, containerId: 'edge' }),
      shape('annotation', { type: 'text', x: 220, y: 10, width: 40, height: 20, containerId: null }),
      arrow(
        'edge',
        [
          [50, 25],
          [350, 25],
        ],
        { startBinding: { elementId: 'source' }, endBinding: { elementId: 'target' } },
      ),
    ])
    expect(result.issues).toEqual([
      { kind: 'arrow_through_content', ids: ['edge', 'obstacle'] },
      { kind: 'arrow_through_content', ids: ['edge', 'annotation'] },
    ])
  })

  it('distinguishes overlapping runs and crossing arrows from a shared endpoint', () => {
    expect(
      checkDrawLayout([
        arrow('one', [
          [0, 0],
          [100, 0],
        ]),
        arrow('two', [
          [40, 0],
          [150, 0],
        ]),
      ]).issues,
    ).toEqual([{ kind: 'arrows_overlap', ids: ['one', 'two'] }])
    expect(
      checkDrawLayout([
        arrow('one', [
          [0, 0],
          [100, 0],
        ]),
        arrow('two', [
          [50, -50],
          [50, 50],
        ]),
      ]).issues,
    ).toEqual([{ kind: 'arrows_cross', ids: ['one', 'two'] }])
    expect(
      checkDrawLayout([
        arrow('one', [
          [0, 0],
          [100, 0],
        ]),
        arrow('two', [
          [100, 0],
          [100, 100],
        ]),
      ]).issues,
    ).toEqual([])
  })

  it('accepts a connector detour around a box and a separate parallel lane', () => {
    expect(
      checkDrawLayout([
        shape('obstacle', { x: 40, y: -20, width: 20, height: 40 }),
        arrow('detour', [
          [0, 0],
          [0, -50],
          [100, -50],
          [100, 0],
        ]),
        arrow('parallel', [
          [0, 60],
          [100, 60],
        ]),
      ]).issues,
    ).toEqual([])
  })

  it('reports incomplete scans and skipped rotations instead of claiming a clean full check', () => {
    const result = checkDrawLayout(
      [
        shape('rotated', { angle: Math.PI / 2 }),
        ...Array.from({ length: 20 }, (_, i) =>
          arrow(`edge-${i}`, [
            [0, i],
            [100, i],
          ]),
        ),
      ],
      10,
    )
    expect(result.complete).toBe(false)
    expect(result.rotatedElementsSkipped).toBe(1)
  })
})
