export interface LayoutNode {
  id: string
}

export interface LayoutEdge {
  from: string
  to: string
}

export interface LayoutPoint {
  id: string
  x: number
  y: number
}

const ITERATIONS = 28
const CELL = 150
const REPULSION = 520
const SPRING_LENGTH = 56
const SPRING_K = 0.22
const CENTER_K = 0.015
const DAMPING = 0.7
const MAX_SPEED = 20
const MIN_DIST2 = 0.16

/** FNV-1a. Stable across input order because the seed uses the id, not the array index. */
function hashId(id: string): number {
  let hash = 2166136261
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function uniqueIds(nodes: readonly LayoutNode[]): string[] {
  const seen = new Set<string>()
  const ids: string[] = []
  for (const node of nodes) {
    if (!node.id || seen.has(node.id)) continue
    seen.add(node.id)
    ids.push(node.id)
  }
  ids.sort()
  return ids
}

function springPairs(ids: readonly string[], edges: readonly LayoutEdge[]): Array<[number, number]> {
  const indexById = new Map<string, number>()
  for (let index = 0; index < ids.length; index += 1) indexById.set(ids[index], index)

  const seen = new Set<string>()
  const pairs: Array<[number, number]> = []
  for (const edge of edges) {
    const from = indexById.get(edge.from)
    const to = indexById.get(edge.to)
    if (from === undefined || to === undefined || from === to) continue
    const low = Math.min(from, to)
    const high = Math.max(from, to)
    const key = `${low}:${high}`
    if (seen.has(key)) continue
    seen.add(key)
    pairs.push([low, high])
  }
  pairs.sort((left, right) => left[0] - right[0] || left[1] - right[1])
  return pairs
}

function repel(x: Float64Array, y: Float64Array, vx: Float64Array, vy: Float64Array): void {
  const count = x.length
  const buckets = new Map<string, number[]>()
  for (let index = 0; index < count; index += 1) {
    const key = `${Math.floor(x[index] / CELL)},${Math.floor(y[index] / CELL)}`
    const bucket = buckets.get(key)
    if (bucket) bucket.push(index)
    else buckets.set(key, [index])
  }

  for (let index = 0; index < count; index += 1) {
    const cellX = Math.floor(x[index] / CELL)
    const cellY = Math.floor(y[index] / CELL)
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        const bucket = buckets.get(`${cellX + offsetX},${cellY + offsetY}`)
        if (!bucket) continue
        for (let cursor = 0; cursor < bucket.length; cursor += 1) {
          const other = bucket[cursor]
          if (other <= index) continue
          let dx = x[index] - x[other]
          let dy = y[index] - y[other]
          let dist2 = dx * dx + dy * dy
          if (dist2 < MIN_DIST2) {
            dx = (index - other) * 0.01 || 0.01
            dy = 0.01
            dist2 = dx * dx + dy * dy
          }
          const inv = REPULSION / dist2
          vx[index] += dx * inv
          vy[index] += dy * inv
          vx[other] -= dx * inv
          vy[other] -= dy * inv
        }
      }
    }
  }
}

function spring(
  x: Float64Array,
  y: Float64Array,
  vx: Float64Array,
  vy: Float64Array,
  pairs: readonly (readonly [number, number])[],
): void {
  for (let index = 0; index < pairs.length; index += 1) {
    const [from, to] = pairs[index]
    let dx = x[to] - x[from]
    let dy = y[to] - y[from]
    let distance = Math.hypot(dx, dy)
    if (distance < 0.01) {
      dx = 0.01
      dy = 0
      distance = 0.01
    }
    const scale = (SPRING_K * (distance - SPRING_LENGTH)) / distance
    vx[from] += dx * scale
    vy[from] += dy * scale
    vx[to] -= dx * scale
    vy[to] -= dy * scale
  }
}

/**
 * Deterministic force-directed layout. Positions are seeded from node ids, then a fixed
 * number of repulsion, spring, and centering steps run. Input order does not matter.
 */
export function layoutWikiGraph(nodes: readonly LayoutNode[], edges: readonly LayoutEdge[]): LayoutPoint[] {
  const ids = uniqueIds(nodes)
  const count = ids.length
  if (count === 0) return []

  const x = new Float64Array(count)
  const y = new Float64Array(count)
  const vx = new Float64Array(count)
  const vy = new Float64Array(count)
  const radius = 40 + Math.sqrt(count) * 24
  for (let index = 0; index < count; index += 1) {
    const hash = hashId(ids[index])
    const angle = (hash / 4294967296) * Math.PI * 2
    const ring = 0.45 + ((hash >>> 8) % 1000) / 1000
    x[index] = Math.cos(angle) * radius * ring
    y[index] = Math.sin(angle) * radius * ring
  }

  const pairs = springPairs(ids, edges)
  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    repel(x, y, vx, vy)
    spring(x, y, vx, vy, pairs)
    for (let index = 0; index < count; index += 1) {
      vx[index] = (vx[index] - x[index] * CENTER_K) * DAMPING
      vy[index] = (vy[index] - y[index] * CENTER_K) * DAMPING
      const speed = Math.hypot(vx[index], vy[index])
      if (speed > MAX_SPEED) {
        const scale = MAX_SPEED / speed
        vx[index] *= scale
        vy[index] *= scale
      }
      x[index] += vx[index]
      y[index] += vy[index]
    }
  }

  const points: LayoutPoint[] = []
  for (let index = 0; index < count; index += 1) {
    points.push({ id: ids[index], x: x[index], y: y[index] })
  }
  return points
}
