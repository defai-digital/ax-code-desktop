import type { FileDiffMetadata } from "@pierre/diffs"

export interface DiffParseRequest {
  id: number
  name: string
  original: string
  modified: string
}

export type DiffParseResponse = { id: number; diff: FileDiffMetadata } | { id: number; error: string }

export function isDiffParseResponse(value: unknown): value is DiffParseResponse {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as { id?: unknown; diff?: unknown; error?: unknown }
  if (typeof candidate.id !== "number") return false
  if (typeof candidate.error === "string") return true
  const diff = candidate.diff as { hunks?: unknown } | null | undefined
  return typeof diff === "object" && diff !== null && Array.isArray(diff.hunks)
}
