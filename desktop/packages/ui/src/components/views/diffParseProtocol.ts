import type { FileDiffMetadata } from "@pierre/diffs"

export interface DiffParseRequest {
  id: number
  name: string
  original: string
  modified: string
}

/** `approximate` is set only for a coarse engine result: its hunks apply exactly but are not minimal. */
export type DiffParseResponse =
  | { id: number; diff: FileDiffMetadata; approximate?: true }
  | { id: number; error: string }

// Side table rather than a field: FileDiffMetadata is the diff library's type and is shared as-is
// with its renderer. Entries live exactly as long as the cached parse they describe.
const approximateDiffs = new WeakSet<FileDiffMetadata>()

export function markApproximateDiff(diff: FileDiffMetadata): void {
  approximateDiffs.add(diff)
}

/** True when the diff is a coarse preview of a very large change, not a minimal line match. */
export function isApproximateDiff(diff: FileDiffMetadata | null | undefined): boolean {
  return diff != null && approximateDiffs.has(diff)
}

export function isDiffParseResponse(value: unknown): value is DiffParseResponse {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as { id?: unknown; diff?: unknown; error?: unknown }
  if (typeof candidate.id !== "number") return false
  if (typeof candidate.error === "string") return true
  const diff = candidate.diff as { hunks?: unknown } | null | undefined
  return typeof diff === "object" && diff !== null && Array.isArray(diff.hunks)
}
