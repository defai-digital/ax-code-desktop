export type WikiNodeKind = "page" | "source" | "symbol"
export type WikiFreshness = "fresh" | "stale" | "unknown"
export type WikiSymbolProvenance = "verified" | "inferred" | "unavailable"

export const WIKI_NODE_KINDS: readonly WikiNodeKind[] = ["page", "source", "symbol"]

export interface WikiGraphSymbol {
  name: string
  provenance: WikiSymbolProvenance
}

export interface WikiGraphNode {
  id: string
  kind: WikiNodeKind
  label: string
  path: string
  freshness: WikiFreshness
  recordedReferences: number
  summary: string
  symbols: readonly WikiGraphSymbol[]
}

export interface WikiGraphEdge {
  from: string
  to: string
  kind: "references-source" | "contains" | "uses"
  freshness: WikiFreshness
}

export interface WikiKindCounts {
  page: number
  source: number
  symbol: number
  total: number
}

export function countKinds(nodes: readonly { kind: WikiNodeKind }[]): WikiKindCounts {
  const counts: WikiKindCounts = { page: 0, source: 0, symbol: 0, total: nodes.length }
  for (const node of nodes) counts[node.kind] += 1
  return counts
}

export function selectVisibleNodes<T extends WikiGraphNode>(
  nodes: readonly T[],
  kinds: ReadonlySet<WikiNodeKind>,
  query: string,
): T[] {
  const needle = query.trim().toLowerCase()
  const visible: T[] = []
  for (const node of nodes) {
    if (!kinds.has(node.kind)) continue
    if (!needle) {
      visible.push(node)
      continue
    }
    const label = node.label.toLowerCase()
    const path = node.path.toLowerCase()
    if (label.includes(needle) || path.includes(needle)) visible.push(node)
  }
  return visible
}

export function edgesAmong<T extends { from: string; to: string }>(
  edges: readonly T[],
  visibleIds: ReadonlySet<string>,
): T[] {
  return edges.filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to))
}

/** The node itself plus one hop along the supplied edges. */
export function neighbourhoodOf(nodeId: string, edges: readonly { from: string; to: string }[]): Set<string> {
  const neighbours = new Set<string>([nodeId])
  for (const edge of edges) {
    if (edge.from === nodeId) neighbours.add(edge.to)
    else if (edge.to === nodeId) neighbours.add(edge.from)
  }
  return neighbours
}

export function truncateLabel(label: string, max = 32): string {
  const chars = Array.from(label)
  if (chars.length <= max) return label
  return `${chars.slice(0, Math.max(0, max - 1)).join("")}…`
}
