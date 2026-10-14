interface Candidate {
  node: number
  distance: number
}

/** A binary heap of candidates. `before(a, b)` says a belongs nearer the top than b. */
class Heap {
  private items: Candidate[] = []
  private before: (a: Candidate, b: Candidate) => boolean
  constructor(before: (a: Candidate, b: Candidate) => boolean) {
    this.before = before
  }

  get size() {
    return this.items.length
  }

  peek() {
    return this.items[0]
  }

  push(item: Candidate) {
    const items = this.items
    items.push(item)
    let i = items.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (!this.before(items[i], items[parent])) break
      ;[items[i], items[parent]] = [items[parent], items[i]]
      i = parent
    }
  }

  pop() {
    const items = this.items
    const top = items[0]
    const last = items.pop()!
    if (items.length) {
      items[0] = last
      let i = 0
      for (;;) {
        const left = 2 * i + 1
        const right = left + 1
        let best = i
        if (left < items.length && this.before(items[left], items[best])) best = left
        if (right < items.length && this.before(items[right], items[best])) best = right
        if (best === i) break
        ;[items[i], items[best]] = [items[best], items[i]]
        i = best
      }
    }
    return top
  }
}

export interface HnswOptions {
  /** Links per node on the upper layers. The base layer keeps twice as many. */
  m?: number
  /** How many candidates are tracked while inserting. Higher builds a better graph, slower. */
  efConstruction?: number
  /** How many candidates are tracked while searching. Higher finds more true neighbours, slower. */
  efSearch?: number
}

/**
 * Hierarchical Navigable Small World index for approximate nearest-neighbour search. Vectors are
 * normalised on the way in, so the dot product is the cosine similarity. Removing a key hides it
 * from results but keeps its node in the graph, which is rebuilt the next time the index is loaded.
 */
export class HnswIndex {
  private readonly m: number
  private readonly efConstruction: number
  private readonly efSearch: number
  private readonly levelScale: number
  private vectors: Float32Array[] = []
  /** links[node][layer] are the neighbours of a node on that layer. */
  private links: number[][][] = []
  private keys: string[] = []
  private nodes = new Map<string, number>()
  private removed = new Set<number>()
  private entry = -1
  private topLayer = -1

  constructor({ m = 16, efConstruction = 64, efSearch = 100 }: HnswOptions = {}) {
    this.m = m
    this.efConstruction = efConstruction
    this.efSearch = efSearch
    this.levelScale = 1 / Math.log(m)
  }

  /** How many keys can be found. */
  get size() {
    return this.nodes.size
  }

  has(key: string) {
    return this.nodes.has(key)
  }

  /** Adds a vector under a key, replacing the vector that key had. */
  add(key: string, vector: Float32Array) {
    this.remove(key)
    const unit = normalise(vector)
    const node = this.vectors.length
    const level = Math.floor(-Math.log(1 - Math.random()) * this.levelScale)
    this.vectors.push(unit)
    this.keys.push(key)
    this.links.push(Array.from({ length: level + 1 }, () => []))
    this.nodes.set(key, node)

    if (this.entry < 0) {
      this.entry = node
      this.topLayer = level
      return
    }

    let near = this.entry
    for (let layer = this.topLayer; layer > level; layer--) near = this.greedy(unit, near, layer)
    for (let layer = Math.min(level, this.topLayer); layer >= 0; layer--) {
      const found = this.searchLayer(unit, [near], this.efConstruction, layer)
      const limit = layer === 0 ? this.m * 2 : this.m
      this.links[node][layer] = found.slice(0, this.m).map((candidate) => candidate.node)
      for (const { node: other } of found.slice(0, this.m)) {
        const otherLinks = this.links[other][layer]
        otherLinks.push(node)
        if (otherLinks.length > limit) this.links[other][layer] = this.closest(other, otherLinks, limit)
      }
      near = found[0].node
    }
    if (level > this.topLayer) {
      this.entry = node
      this.topLayer = level
    }
  }

  /** Hides a key from search results. */
  remove(key: string) {
    const node = this.nodes.get(key)
    if (node === undefined) return
    this.nodes.delete(key)
    this.removed.add(node)
  }

  /** The `k` keys closest to the vector, best first. `score` is the cosine similarity. */
  search(vector: Float32Array, k: number) {
    if (this.entry < 0 || !this.nodes.size) return []
    const unit = normalise(vector)
    let near = this.entry
    for (let layer = this.topLayer; layer > 0; layer--) near = this.greedy(unit, near, layer)
    const found = this.searchLayer(unit, [near], Math.max(this.efSearch, k + this.removed.size), 0)
    return found
      .filter((candidate) => !this.removed.has(candidate.node))
      .slice(0, k)
      .map((candidate) => ({ key: this.keys[candidate.node], score: 1 - candidate.distance }))
  }

  private distance(a: Float32Array, b: Float32Array) {
    let dot = 0
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
    return 1 - dot
  }

  /** Walks to the closest node it can reach on one layer, one step at a time. */
  private greedy(query: Float32Array, start: number, layer: number) {
    let best = start
    let bestDistance = this.distance(query, this.vectors[start])
    for (let moved = true; moved;) {
      moved = false
      for (const next of this.links[best][layer] ?? []) {
        const d = this.distance(query, this.vectors[next])
        if (d < bestDistance) {
          best = next
          bestDistance = d
          moved = true
        }
      }
    }
    return best
  }

  /** Up to `ef` nodes near the query on one layer, closest first. */
  private searchLayer(query: Float32Array, starts: number[], ef: number, layer: number) {
    const visited = new Set(starts)
    const toVisit = new Heap((a, b) => a.distance < b.distance)
    const found = new Heap((a, b) => a.distance > b.distance)
    for (const node of starts) {
      const candidate = { node, distance: this.distance(query, this.vectors[node]) }
      toVisit.push(candidate)
      found.push(candidate)
    }
    while (toVisit.size) {
      const current = toVisit.pop()
      if (found.size >= ef && current.distance > found.peek().distance) break
      for (const next of this.links[current.node][layer] ?? []) {
        if (visited.has(next)) continue
        visited.add(next)
        const distance = this.distance(query, this.vectors[next])
        if (found.size < ef || distance < found.peek().distance) {
          toVisit.push({ node: next, distance })
          found.push({ node: next, distance })
          if (found.size > ef) found.pop()
        }
      }
    }
    const sorted: Candidate[] = []
    while (found.size) sorted.push(found.pop())
    return sorted.reverse()
  }

  /** The `count` nodes of `nodes` closest to `of`. */
  private closest(of: number, nodes: number[], count: number) {
    return nodes
      .map((node) => ({ node, distance: this.distance(this.vectors[of], this.vectors[node]) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, count)
      .map((candidate) => candidate.node)
  }
}

function normalise(vector: Float32Array) {
  let sum = 0
  for (const value of vector) sum += value * value
  const length = Math.sqrt(sum) || 1
  return vector.map((value) => value / length)
}
