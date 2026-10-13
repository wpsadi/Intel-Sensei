import * as THREE from 'three'
import { edgeTable, triTable } from 'three/examples/jsm/objects/MarchingCubes.js'
import type { MeshData3D } from '../types'

/** A piece of a scene in world space: its triangles and the colour it was drawn with. */
export interface Piece {
  geometry: THREE.BufferGeometry
  color: THREE.Color
}

const r4 = (v: number) => Math.round(v * 1e4) / 1e4
const r3 = (v: number) => Math.round(v * 1e3) / 1e3

/** The meshes under the object with this id, baked into world space. Call after `root.updateMatrixWorld(true)`. */
export function piecesOf(root: THREE.Object3D, id: string): Piece[] {
  let subject: THREE.Object3D | undefined
  root.traverse((o) => { if (!subject && !o.userData.helper && o.userData.id === id) subject = o })
  const out: Piece[] = []
  subject?.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || !m.geometry || !m.visible || o.userData.fur) return
    const geometry = m.geometry.clone().applyMatrix4(m.matrixWorld)
    const mat = [m.material].flat()[0] as THREE.MeshPhysicalMaterial | undefined
    const color = (mat?.color ?? new THREE.Color('#cccccc')).clone()
    const attr = geometry.getAttribute('color')
    // A mesh that already carries colours per vertex keeps them as its average here.
    if (attr && mat?.vertexColors) {
      const sum = new THREE.Color(0, 0, 0)
      for (let i = 0; i < attr.count; i++) sum.add(new THREE.Color(attr.getX(i), attr.getY(i), attr.getZ(i)))
      color.copy(sum.multiplyScalar(1 / Math.max(attr.count, 1)))
    }
    out.push({ geometry, color })
  })
  return out
}

const triangles = (g: THREE.BufferGeometry) => {
  const pos = g.getAttribute('position')
  const idx = g.getIndex()
  return { pos, count: idx ? idx.count / 3 : pos.count / 3, at: (i: number) => (idx ? idx.getX(i) : i) }
}

const distinct = (colors: THREE.Color[]) => new Set(colors.map((c) => c.getHexString())).size > 1

/** Joins pieces into one mesh, keeping each piece's colour as vertex colours when they differ. */
export function joinPieces(pieces: Piece[]): MeshData3D {
  const positions: number[] = [], indices: number[] = [], colors: number[] = []
  const withColor = distinct(pieces.map((p) => p.color))
  for (const { geometry, color } of pieces) {
    const base = positions.length / 3
    const { pos, count, at } = triangles(geometry)
    const attr = geometry.getAttribute('color')
    for (let i = 0; i < pos.count; i++) {
      positions.push(r4(pos.getX(i)), r4(pos.getY(i)), r4(pos.getZ(i)))
      if (withColor) colors.push(...(attr ? [attr.getX(i), attr.getY(i), attr.getZ(i)] : [color.r, color.g, color.b]).map(r3))
    }
    for (let t = 0; t < count * 3; t++) indices.push(base + at(t))
  }
  return { positions, indices, ...(withColor && { colors }) }
}

/** Six times the volume enclosed by the triangles; negative when they face inward. */
export function signedVolume(m: Pick<MeshData3D, 'positions' | 'indices'>) {
  const p = m.positions
  let v = 0
  for (let t = 0; t < m.indices.length; t += 3) {
    const a = m.indices[t] * 3, b = m.indices[t + 1] * 3, c = m.indices[t + 2] * 3
    v += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])
  }
  return v / 6
}

/* ---------- voxel remesh ---------- */

export type BooleanOp = 'union' | 'subtract' | 'intersect'
const MAX_TRIANGLES = 300_000

interface Grid { nx: number; ny: number; nz: number; min: THREE.Vector3; cell: number }

/**
 * Marks the voxels inside a closed piece by casting a ray along z through every voxel column and filling between
 * entering and leaving hits. Each piece is filled alone, so pieces that overlap still add up correctly.
 */
function fillPiece(geo: THREE.BufferGeometry, g: Grid, occ: Uint8Array, owner: Uint16Array, id: number) {
  const { pos, count, at } = triangles(geo)
  const columns = new Map<number, number[]>()
  // Samples sit a hair off the cell centres so a ray never runs exactly along an edge two triangles share.
  const jx = 0.0137, jy = 0.0291
  const ox = g.min.x, oy = g.min.y
  for (let t = 0; t < count; t++) {
    const ia = at(t * 3), ib = at(t * 3 + 1), ic = at(t * 3 + 2)
    const ax = pos.getX(ia), ay = pos.getY(ia), az = pos.getZ(ia)
    const bx = pos.getX(ib), by = pos.getY(ib), bz = pos.getZ(ib)
    const cx = pos.getX(ic), cy = pos.getY(ic), cz = pos.getZ(ic)
    const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay)
    if (Math.abs(area) < 1e-12) continue
    const x0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) - ox) / g.cell - 0.5 - jx))
    const x1 = Math.min(g.nx - 1, Math.floor((Math.max(ax, bx, cx) - ox) / g.cell - 0.5 - jx))
    const y0 = Math.max(0, Math.ceil((Math.min(ay, by, cy) - oy) / g.cell - 0.5 - jy))
    const y1 = Math.min(g.ny - 1, Math.floor((Math.max(ay, by, cy) - oy) / g.cell - 0.5 - jy))
    for (let iy = y0; iy <= y1; iy++) {
      const py = oy + (iy + 0.5 + jy) * g.cell
      for (let ix = x0; ix <= x1; ix++) {
        const px = ox + (ix + 0.5 + jx) * g.cell
        const w0 = ((bx - px) * (cy - py) - (cx - px) * (by - py)) / area
        const w1 = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) / area
        const w2 = 1 - w0 - w1
        if (w0 < 0 || w1 < 0 || w2 < 0) continue
        const key = iy * g.nx + ix
        const list = columns.get(key)
        const z = w0 * az + w1 * bz + w2 * cz
        if (list) list.push(z)
        else columns.set(key, [z])
      }
    }
  }
  for (const [key, zs] of columns) {
    zs.sort((a, b) => a - b)
    const ix = key % g.nx, iy = (key / g.nx) | 0
    // An odd count means the piece is open here; the unmatched last hit is ignored.
    for (let h = 0; h + 1 < zs.length; h += 2) {
      const k0 = Math.max(0, Math.ceil((zs[h] - g.min.z) / g.cell - 0.5))
      const k1 = Math.min(g.nz - 1, Math.floor((zs[h + 1] - g.min.z) / g.cell - 0.5))
      for (let k = k0; k <= k1; k++) {
        const v = (k * g.ny + iy) * g.nx + ix
        occ[v] = 1
        owner[v] = id
      }
    }
  }
}

/** Averages each node with its neighbours along every axis, `passes` times, rounding off the blocky voxel steps. */
function blur(f: Float32Array, g: Grid, passes: number) {
  const tmp = new Float32Array(f.length)
  const strides = [1, g.nx, g.nx * g.ny]
  const dims = [g.nx, g.ny, g.nz]
  for (let p = 0; p < passes; p++) {
    for (let axis = 0; axis < 3; axis++) {
      const s = strides[axis], n = dims[axis]
      for (let i = 0; i < f.length; i++) {
        const c = Math.floor(i / s) % n
        const a = c > 0 ? f[i - s] : f[i]
        const b = c < n - 1 ? f[i + s] : f[i]
        tmp[i] = (a + f[i] + b) / 3
      }
      f.set(tmp)
    }
  }
}

/** Lower corner offset and axis of each of a cube's 12 edges, in the order the marching-cubes tables use. */
const EDGES: [number, number, number, number][] = [
  [0, 0, 0, 0], [1, 0, 0, 1], [0, 1, 0, 0], [0, 0, 0, 1], [0, 0, 1, 0], [1, 0, 1, 1], [0, 1, 1, 0], [0, 0, 1, 1], [0, 0, 0, 2], [1, 0, 0, 2], [1, 1, 0, 2], [0, 1, 0, 2],
]
const CORNERS: [number, number, number][] = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]

/**
 * Rebuilds the pieces as ONE continuous surface: each operand (a list of pieces, e.g. one object) is voxelized, the
 * operands are combined (union adds them, subtract cuts the others out of the first, intersect keeps the overlap),
 * the voxels are smoothed and a surface is extracted. Where pieces overlap, later ones decide the colour.
 */
export function voxelMesh(operands: Piece[][], op: BooleanOp, { resolution = 64, smooth = 1 }: { resolution?: number; smooth?: number } = {}): MeshData3D {
  const box = new THREE.Box3()
  for (const piece of operands.flat()) {
    piece.geometry.computeBoundingBox()
    box.union(piece.geometry.boundingBox!)
  }
  if (box.isEmpty()) throw new Error('There is nothing to remesh')
  const size = box.getSize(new THREE.Vector3())
  const cell = Math.max(size.x, size.y, size.z) / resolution
  const pad = 3
  const g: Grid = {
    nx: Math.ceil(size.x / cell) + pad * 2, ny: Math.ceil(size.y / cell) + pad * 2, nz: Math.ceil(size.z / cell) + pad * 2,
    min: box.min.clone().subScalar(pad * cell), cell,
  }
  const total = g.nx * g.ny * g.nz
  const palette: THREE.Color[] = []
  const occ = new Uint8Array(total), owner = new Uint16Array(total)
  const tmpOcc = new Uint8Array(total), tmpOwner = new Uint16Array(total)
  const cut = new Uint8Array(total)

  operands.forEach((pieces, index) => {
    tmpOcc.fill(0)
    tmpOwner.fill(0)
    for (const piece of pieces) {
      palette.push(piece.color)
      fillPiece(piece.geometry, g, tmpOcc, tmpOwner, palette.length)
    }
    for (let v = 0; v < total; v++) {
      if (op === 'union') {
        if (tmpOcc[v]) { occ[v] = 1; owner[v] = tmpOwner[v] }
      } else if (index === 0) {
        occ[v] = tmpOcc[v]
        owner[v] = tmpOwner[v]
      } else if (op === 'subtract') cut[v] ||= tmpOcc[v]
      else if (!tmpOcc[v]) occ[v] = 0
    }
  })
  if (op === 'subtract') for (let v = 0; v < total; v++) if (cut[v]) occ[v] = 0
  if (!occ.some(Boolean)) throw new Error('The result is empty: the pieces do not overlap or enclose any volume (open surfaces such as planes have no inside)')

  // Empty nodes next to coloured ones take their colour, so the smoothed surface still finds one.
  for (let pass = 0; pass < 3; pass++) {
    const next = owner.slice()
    for (let k = 1; k < g.nz - 1; k++) for (let j = 1; j < g.ny - 1; j++) for (let i = 1; i < g.nx - 1; i++) {
      const v = (k * g.ny + j) * g.nx + i
      if (owner[v]) continue
      next[v] = owner[v - 1] || owner[v + 1] || owner[v - g.nx] || owner[v + g.nx] || owner[v - g.nx * g.ny] || owner[v + g.nx * g.ny]
    }
    owner.set(next)
  }

  const field = Float32Array.from(occ)
  blur(field, g, Math.max(0, Math.round(smooth)))

  const positions: number[] = [], colors: number[] = [], indices: number[] = []
  const made = new Map<number, number>()
  const node = (i: number, j: number, k: number) => (k * g.ny + j) * g.nx + i
  const corner = new Float32Array(8)
  for (let k = 0; k < g.nz - 1; k++) for (let j = 0; j < g.ny - 1; j++) for (let i = 0; i < g.nx - 1; i++) {
    let index = 0
    for (let c = 0; c < 8; c++) {
      corner[c] = field[node(i + CORNERS[c][0], j + CORNERS[c][1], k + CORNERS[c][2])]
      if (corner[c] < 0.5) index |= 1 << c
    }
    if (!edgeTable[index]) continue
    const verts = new Array<number>(12)
    for (let e = 0; e < 12; e++) {
      if (!(edgeTable[index] & (1 << e))) continue
      const [dx, dy, dz, axis] = EDGES[e]
      const key = (node(i + dx, j + dy, k + dz)) * 3 + axis
      let vi = made.get(key)
      if (vi === undefined) {
        const a = node(i + dx, j + dy, k + dz)
        const b = axis === 0 ? a + 1 : axis === 1 ? a + g.nx : a + g.nx * g.ny
        const fa = field[a], fb = field[b]
        const t = fb === fa ? 0.5 : (0.5 - fa) / (fb - fa)
        const ia = i + dx, ja = j + dy, ka = k + dz
        const px = g.min.x + (ia + (axis === 0 ? t : 0) + 0.5) * g.cell
        const py = g.min.y + (ja + (axis === 1 ? t : 0) + 0.5) * g.cell
        const pz = g.min.z + (ka + (axis === 2 ? t : 0) + 0.5) * g.cell
        vi = positions.length / 3
        positions.push(r4(px), r4(py), r4(pz))
        const c = palette[(owner[fa >= fb ? a : b] || 1) - 1] ?? palette[0]
        colors.push(r3(c.r), r3(c.g), r3(c.b))
        made.set(key, vi)
      }
      verts[e] = vi
    }
    for (let t = 0; triTable[index * 16 + t] !== -1; t += 3) {
      indices.push(verts[triTable[index * 16 + t]], verts[triTable[index * 16 + t + 1]], verts[triTable[index * 16 + t + 2]])
    }
    if (indices.length / 3 > MAX_TRIANGLES) throw new Error(`The surface has over ${MAX_TRIANGLES} triangles; lower the resolution`)
  }

  const mesh: MeshData3D = { positions, indices }
  // The tables wind the other way round for this field; make the faces point outward.
  if (signedVolume(mesh) < 0) for (let t = 0; t < indices.length; t += 3) [indices[t + 1], indices[t + 2]] = [indices[t + 2], indices[t + 1]]
  if (distinct(palette)) mesh.colors = colors
  return mesh
}

/* ---------- smoothing and cleanup ---------- */

/** Smooths with Taubin's two-step (shrink, then re-inflate) so shapes round off without getting smaller. */
export function smoothMesh(mesh: MeshData3D, iterations = 3, strength = 0.5): MeshData3D {
  const n = mesh.positions.length / 3
  const neighbours: Set<number>[] = Array.from({ length: n }, () => new Set())
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const [a, b, c] = [mesh.indices[t], mesh.indices[t + 1], mesh.indices[t + 2]]
    neighbours[a].add(b).add(c)
    neighbours[b].add(a).add(c)
    neighbours[c].add(a).add(b)
  }
  let cur = Float32Array.from(mesh.positions)
  const step = (factor: number) => {
    const next = new Float32Array(cur.length)
    for (let v = 0; v < n; v++) {
      const nb = neighbours[v]
      if (!nb.size) {
        next.set(cur.subarray(v * 3, v * 3 + 3), v * 3)
        continue
      }
      let x = 0, y = 0, z = 0
      for (const u of nb) { x += cur[u * 3]; y += cur[u * 3 + 1]; z += cur[u * 3 + 2] }
      next[v * 3] = cur[v * 3] + factor * (x / nb.size - cur[v * 3])
      next[v * 3 + 1] = cur[v * 3 + 1] + factor * (y / nb.size - cur[v * 3 + 1])
      next[v * 3 + 2] = cur[v * 3 + 2] + factor * (z / nb.size - cur[v * 3 + 2])
    }
    cur = next
  }
  for (let i = 0; i < iterations; i++) {
    step(strength)
    step(-strength * 1.06)
  }
  return { ...mesh, positions: Array.from(cur, r4) }
}

/** Merges vertices closer than `distance`, drops degenerate and duplicate triangles and unused vertices. */
export function cleanMesh(mesh: MeshData3D, distance: number) {
  const q = (v: number) => Math.round(v / distance)
  const remap = new Map<string, number>()
  const positions: number[] = [], colors: number[] = []
  const map = new Array<number>(mesh.positions.length / 3)
  for (let v = 0; v < map.length; v++) {
    const x = mesh.positions[v * 3], y = mesh.positions[v * 3 + 1], z = mesh.positions[v * 3 + 2]
    const key = `${q(x)},${q(y)},${q(z)}`
    let id = remap.get(key)
    if (id === undefined) {
      id = positions.length / 3
      positions.push(x, y, z)
      if (mesh.colors) colors.push(mesh.colors[v * 3], mesh.colors[v * 3 + 1], mesh.colors[v * 3 + 2])
      remap.set(key, id)
    }
    map[v] = id
  }
  const seen = new Set<string>()
  const indices: number[] = []
  let degenerate = 0, duplicate = 0
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const [a, b, c] = [map[mesh.indices[t]], map[mesh.indices[t + 1]], map[mesh.indices[t + 2]]]
    if (a === b || b === c || a === c) { degenerate++; continue }
    const key = [a, b, c].sort((x, y) => x - y).join(',')
    if (seen.has(key)) { duplicate++; continue }
    seen.add(key)
    indices.push(a, b, c)
  }
  const out: MeshData3D = { positions, indices, ...(mesh.colors && { colors }) }
  return { mesh: out, welded: map.length - positions.length / 3, degenerate, duplicate }
}

/* ---------- subdivision, sculpting, painting ---------- */

const MAX_SUBDIVIDED = 400_000

/** Splits every triangle into four (colours blend along the new edges) and relaxes the result, so faceted forms turn smooth. */
export function subdivideMesh(mesh: MeshData3D, levels = 1, relax = true): MeshData3D {
  let cur = mesh
  for (let l = 0; l < Math.max(1, Math.min(3, Math.round(levels))); l++) {
    if ((cur.indices.length / 3) * 4 > MAX_SUBDIVIDED) throw new Error(`Subdividing again would exceed ${MAX_SUBDIVIDED} triangles`)
    const positions = cur.positions.slice(), colors = cur.colors?.slice()
    const mid = new Map<number, number>()
    const n = cur.positions.length / 3
    const edge = (a: number, b: number) => {
      const key = a < b ? a * n + b : b * n + a
      let m = mid.get(key)
      if (m === undefined) {
        m = positions.length / 3
        positions.push((cur.positions[a * 3] + cur.positions[b * 3]) / 2, (cur.positions[a * 3 + 1] + cur.positions[b * 3 + 1]) / 2, (cur.positions[a * 3 + 2] + cur.positions[b * 3 + 2]) / 2)
        if (colors) colors.push((cur.colors![a * 3] + cur.colors![b * 3]) / 2, (cur.colors![a * 3 + 1] + cur.colors![b * 3 + 1]) / 2, (cur.colors![a * 3 + 2] + cur.colors![b * 3 + 2]) / 2)
        mid.set(key, m)
      }
      return m
    }
    const indices: number[] = []
    for (let t = 0; t < cur.indices.length; t += 3) {
      const a = cur.indices[t], b = cur.indices[t + 1], c = cur.indices[t + 2]
      const ab = edge(a, b), bc = edge(b, c), ca = edge(c, a)
      indices.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca)
    }
    cur = { positions, indices, ...(colors && { colors }) }
  }
  return relax ? smoothMesh(cur, 2, 0.35) : { ...cur, positions: cur.positions.map(r4) }
}

function vertexNormals(m: MeshData3D) {
  const normals = new Float32Array(m.positions.length)
  const p = m.positions
  for (let t = 0; t < m.indices.length; t += 3) {
    const a = m.indices[t] * 3, b = m.indices[t + 1] * 3, c = m.indices[t + 2] * 3
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2]
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2]
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    for (const i of [a, b, c]) { normals[i] += nx; normals[i + 1] += ny; normals[i + 2] += nz }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const l = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1
    normals[i] /= l; normals[i + 1] /= l; normals[i + 2] /= l
  }
  return normals
}

export type Brush = 'inflate' | 'deflate' | 'smooth' | 'pinch' | 'crease'
export interface Stroke { brush: Brush; center: [number, number, number]; radius: number; strength?: number }

/** Pushes, pulls, relaxes or pinches the surface around points, like sculpting brushes. Strokes apply in order. */
export function sculptMesh(mesh: MeshData3D, strokes: Stroke[]): MeshData3D {
  const p = Float32Array.from(mesh.positions)
  const n = p.length / 3
  const neighbours: number[][] = Array.from({ length: n }, () => [])
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const [a, b, c] = [mesh.indices[t], mesh.indices[t + 1], mesh.indices[t + 2]]
    neighbours[a].push(b, c)
    neighbours[b].push(a, c)
    neighbours[c].push(a, b)
  }
  for (const { brush, center, radius, strength = 0.5 } of strokes) {
    const normals = vertexNormals({ positions: Array.from(p), indices: mesh.indices })
    const next = p.slice()
    for (let v = 0; v < n; v++) {
      const dx = p[v * 3] - center[0], dy = p[v * 3 + 1] - center[1], dz = p[v * 3 + 2] - center[2]
      const d = Math.hypot(dx, dy, dz)
      if (d >= radius) continue
      const f = 1 - (d / radius) ** 2
      const w = f * f * Math.max(0, Math.min(1, strength))
      const nx = normals[v * 3], ny = normals[v * 3 + 1], nz = normals[v * 3 + 2]
      if (brush === 'inflate' || brush === 'deflate') {
        const k = (brush === 'inflate' ? 1 : -1) * w * radius * 0.35
        next[v * 3] += nx * k; next[v * 3 + 1] += ny * k; next[v * 3 + 2] += nz * k
      } else if (brush === 'crease') {
        // A narrow groove: strongest at the centre, falling off fast.
        const k = -w * w * radius * 0.4
        next[v * 3] += nx * k; next[v * 3 + 1] += ny * k; next[v * 3 + 2] += nz * k
      } else if (brush === 'smooth') {
        const nb = neighbours[v]
        if (!nb.length) continue
        let x = 0, y = 0, z = 0
        for (const u of nb) { x += p[u * 3]; y += p[u * 3 + 1]; z += p[u * 3 + 2] }
        next[v * 3] += (x / nb.length - p[v * 3]) * w
        next[v * 3 + 1] += (y / nb.length - p[v * 3 + 1]) * w
        next[v * 3 + 2] += (z / nb.length - p[v * 3 + 2]) * w
      } else {
        // pinch: draw the surface toward the centre, along the surface.
        const along = -(dx * nx + dy * ny + dz * nz)
        next[v * 3] += (-dx - nx * along) * w * 0.5
        next[v * 3 + 1] += (-dy - ny * along) * w * 0.5
        next[v * 3 + 2] += (-dz - nz * along) * w * 0.5
      }
    }
    p.set(next)
  }
  return { ...mesh, positions: Array.from(p, r4) }
}

const hash3 = (x: number, y: number, z: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453
  return s - Math.floor(s)
}
function noise3(x: number, y: number, z: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z)
  const f = (t: number) => t * t * (3 - 2 * t)
  const xf = f(x - xi), yf = f(y - yi), zf = f(z - zi)
  const l = (a: number, b: number, t: number) => a + (b - a) * t
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz)
  return l(l(l(c(0, 0, 0), c(1, 0, 0), xf), l(c(0, 1, 0), c(1, 1, 0), xf), yf), l(l(c(0, 0, 1), c(1, 0, 1), xf), l(c(0, 1, 1), c(1, 1, 1), xf), yf), zf)
}
const fbm3 = (x: number, y: number, z: number) => 0.55 * noise3(x, y, z) + 0.3 * noise3(x * 2.1, y * 2.1, z * 2.1) + 0.15 * noise3(x * 4.3, y * 4.3, z * 4.3)

export type PaintOp =
  | { kind: 'brush'; center: [number, number, number]; radius: number; color: string; strength?: number; noise?: number }
  | { kind: 'patches'; color: string; coverage?: number; scale?: number; seed?: number; softness?: number; region?: { center: [number, number, number]; radius: number }; yRange?: [number, number] }
  | { kind: 'variation'; amount?: number; scale?: number; seed?: number }

/**
 * Paints per-vertex colours: round brush strokes, irregular patches (cow markings, camouflage), or a subtle
 * brightness variation (dirt, natural imperfections). Detail follows the vertex density, so subdivide first for crisp edges.
 */
export function paintMesh(mesh: MeshData3D, base: THREE.Color, ops: PaintOp[]): MeshData3D {
  const n = mesh.positions.length / 3
  const colors = mesh.colors ? mesh.colors.slice() : Array.from({ length: n * 3 }, (_, i) => [base.r, base.g, base.b][i % 3])
  const mix = (v: number, c: THREE.Color, w: number) => {
    colors[v * 3] += (c.r - colors[v * 3]) * w
    colors[v * 3 + 1] += (c.g - colors[v * 3 + 1]) * w
    colors[v * 3 + 2] += (c.b - colors[v * 3 + 2]) * w
  }
  for (const op of ops) {
    if (op.kind === 'variation') {
      const amount = op.amount ?? 0.08, scale = 1 / Math.max(op.scale ?? 0.15, 1e-3), seed = (op.seed ?? 1) * 17.3
      for (let v = 0; v < n; v++) {
        const k = 1 + (fbm3(mesh.positions[v * 3] * scale + seed, mesh.positions[v * 3 + 1] * scale, mesh.positions[v * 3 + 2] * scale) - 0.5) * 2 * amount
        colors[v * 3] *= k; colors[v * 3 + 1] *= k; colors[v * 3 + 2] *= k
      }
      continue
    }
    const color = new THREE.Color(op.color)
    for (let v = 0; v < n; v++) {
      const x = mesh.positions[v * 3], y = mesh.positions[v * 3 + 1], z = mesh.positions[v * 3 + 2]
      if (op.kind === 'brush') {
        const d = Math.hypot(x - op.center[0], y - op.center[1], z - op.center[2])
        if (d >= op.radius) continue
        const f = 1 - (d / op.radius) ** 2
        const grain = op.noise ? 1 - op.noise * noise3(x * 40, y * 40, z * 40) : 1
        mix(v, color, f * Math.max(0, Math.min(1, op.strength ?? 1)) * grain)
      } else {
        if (op.yRange && (y < op.yRange[0] || y > op.yRange[1])) continue
        if (op.region && Math.hypot(x - op.region.center[0], y - op.region.center[1], z - op.region.center[2]) > op.region.radius) continue
        const scale = 1 / Math.max(op.scale ?? 0.3, 1e-3), seed = (op.seed ?? 1) * 31.7
        const value = fbm3(x * scale + seed, y * scale + seed * 0.5, z * scale)
        const edge = Math.max(0.005, op.softness ?? 0.04)
        const t = (value - (1 - Math.max(0, Math.min(1, op.coverage ?? 0.4)))) / edge
        mix(v, color, Math.max(0, Math.min(1, t * 0.5 + 0.5)) * (t > -1 ? 1 : 0))
      }
    }
  }
  return { ...mesh, colors: colors.map(r3) }
}
