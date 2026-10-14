import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { cleanMesh, joinPieces, signedVolume, smoothMesh, voxelMesh } from './mesh-ops'

const box = (w: number, h: number, d: number, at: [number, number, number], color: string) => ({
  geometry: new THREE.BoxGeometry(w, h, d).translate(...at),
  color: new THREE.Color(color),
})

describe('mesh-ops', () => {
  it('fuses overlapping boxes into one outward-facing surface of the union volume', () => {
    // Two 1×1×1 boxes overlapping by half: the union is 1.5 in volume.
    const m = voxelMesh([[box(1, 1, 1, [0, 0, 0], '#ff0000')], [box(1, 1, 1, [0.5, 0, 0], '#0000ff')]], 'union', {
      resolution: 48,
      smooth: 1,
    })
    expect(m.indices.length).toBeGreaterThan(0)
    expect(signedVolume(m)).toBeGreaterThan(1.3)
    expect(signedVolume(m)).toBeLessThan(1.7)
    // Different colours survive as vertex colours.
    expect(m.colors?.length).toBe(m.positions.length)
  })

  it('subtracts and intersects', () => {
    const a = [box(1, 1, 1, [0, 0, 0], '#ffffff')]
    const b = [box(1, 1, 1, [0.5, 0, 0], '#ffffff')]
    const cut = signedVolume(voxelMesh([a, b], 'subtract', { resolution: 48, smooth: 1 }))
    const both = signedVolume(voxelMesh([a, b], 'intersect', { resolution: 48, smooth: 1 }))
    expect(cut).toBeGreaterThan(0.4)
    expect(cut).toBeLessThan(0.6)
    expect(both).toBeGreaterThan(0.4)
    expect(both).toBeLessThan(0.6)
  })

  it('joins pieces, smooths without shrinking much, and cleans duplicates', () => {
    const joined = joinPieces([box(1, 1, 1, [0, 0, 0], '#ff0000'), box(1, 1, 1, [3, 0, 0], '#00ff00')])
    expect(joined.positions.length / 3).toBe(48)
    expect(joined.colors).toBeDefined()
    const fused = voxelMesh([[box(1, 1, 1, [0, 0, 0], '#999999')]], 'union', { resolution: 32, smooth: 1 })
    const before = signedVolume(fused)
    expect(signedVolume(smoothMesh(fused, 3, 0.5))).toBeGreaterThan(before * 0.85)
    const welded = cleanMesh(joined, 0.001)
    expect(welded.mesh.positions.length / 3).toBe(16)
  })
})

import { paintMesh, sculptMesh, subdivideMesh } from './mesh-ops'

describe('mesh refinement', () => {
  const fused = () => voxelMesh([[box(1, 1, 1, [0, 0, 0], '#999999')]], 'union', { resolution: 24, smooth: 1 })

  it('subdivides to four times the triangles', () => {
    const m = fused()
    expect(subdivideMesh(m, 1).indices.length).toBe(m.indices.length * 4)
  })

  it('inflates the surface around a point and keeps the vertex count', () => {
    const m = fused()
    const out = sculptMesh(m, [{ brush: 'inflate', center: [0.5, 0, 0], radius: 0.4, strength: 1 }])
    expect(out.positions.length).toBe(m.positions.length)
    expect(signedVolume(out)).toBeGreaterThan(signedVolume(m))
  })

  it('paints patches and variation as vertex colours', () => {
    const m = fused()
    const out = paintMesh(m, new THREE.Color('#ffffff'), [
      { kind: 'patches', color: '#000000', coverage: 0.4, scale: 0.3 },
      { kind: 'variation', amount: 0.05 },
    ])
    expect(out.colors?.length).toBe(m.positions.length)
    const dark = out.colors!.filter((_, i) => i % 3 === 0 && out.colors![i] < 0.3).length
    expect(dark).toBeGreaterThan(0)
    expect(dark).toBeLessThan(out.colors!.length / 3)
  })
})
