import type { Geometry3D, Light3D } from '../types'

export const ADD_SHAPES: Geometry3D[] = [
  'box',
  'roundedBox',
  'sphere',
  'cylinder',
  'cone',
  'capsule',
  'torus',
  'torusKnot',
  'plane',
  'ring',
  'icosahedron',
  'dodecahedron',
  'octahedron',
  'tetrahedron',
  'lathe',
  'extrude',
  'tube',
  'helix',
  'wave',
]
export const ADD_LIGHTS: Light3D['type'][] = ['directional', 'point', 'spot', 'hemisphere', 'ambient']
export const label = (s: string) => s.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())
