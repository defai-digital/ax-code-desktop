import type { WikiMaintenanceStatus, WikiVisualizationGraph } from "@defai-digital/ax-code-sdk/v2"

export type WikiLoadState =
  | { status: "graph"; graph: WikiVisualizationGraph }
  | { status: "missing" }
  | { status: "too_large" }
  | { status: "error" }

function isGraph(value: unknown): value is WikiVisualizationGraph {
  if (!value || typeof value !== "object") return false
  const graph = value as Partial<WikiVisualizationGraph>
  return (
    graph.schemaVersion === 1 &&
    typeof graph.snapshot === "string" &&
    Array.isArray(graph.nodes) &&
    Array.isArray(graph.edges)
  )
}

function errorFields(error: unknown): { name?: string; code?: string } {
  if (!error || typeof error !== "object") return {}
  const record = error as { name?: unknown; code?: unknown }
  return {
    name: typeof record.name === "string" ? record.name : undefined,
    code: typeof record.code === "string" ? record.code : undefined,
  }
}

/**
 * Classify a wiki.visualization() result. `missing` is the empty snapshot (no wiki yet).
 * `too_large` and any other failure stay errors. Raw server messages are not surfaced.
 */
export function classifyWikiVisualization(
  result: { data?: unknown; error?: unknown } | null | undefined,
): WikiLoadState {
  if (result && isGraph(result.data)) return { status: "graph", graph: result.data }
  const { code } = errorFields(result?.error)
  if (code === "missing") return { status: "missing" }
  if (code === "too_large") return { status: "too_large" }
  return { status: "error" }
}

/** Keep a previous graph when a background refetch fails. */
export function mergeWikiLoad(current: WikiLoadState | null, next: WikiLoadState, silent: boolean): WikiLoadState {
  if (silent && next.status === "error" && current && current.status !== "error") return current
  return next
}

export function isWikiMaintenanceActive(status: Pick<WikiMaintenanceStatus, "phase"> | null | undefined): boolean {
  return status?.phase === "queued" || status?.phase === "running"
}

export function omittedTotal(omitted: { nodes?: number; edges?: number } | null | undefined): number {
  const safe = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0)
  return safe(omitted?.nodes) + safe(omitted?.edges)
}
