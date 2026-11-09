import { diffAcceptRejectHunk, parseDiffFromFile, type FileDiffMetadata } from "@pierre/diffs"

import { DiffParseError, diffParseClient } from "./diffParseClient"

const DIFF_CACHE_LIMIT = 64
const TOO_LARGE_LIMIT = 64
/**
 * Combined UTF-16 length up to which a cache miss still parses on the renderer thread. Below this a
 * parse takes a few milliseconds, which is cheaper than a Worker round trip and avoids a loading flash.
 */
export const SYNC_PARSE_MAX_CHARACTERS = 16_384

// Full parse results, so the viewer, the hunk list and hunk revert share one parse. Pierre's line
// diff is super-linear in edit distance: a 5k-line rewrite measured about 1.7 s, so larger inputs
// parse in a Worker (SPEC-2026-11-08-diff-parse-worker-v1). Consumers must treat entries as immutable.
const diffCache = new Map<string, FileDiffMetadata>()
// Keys whose parse hit the Worker timeout; remounting the same content must not repeat that work.
const tooLargeKeys = new Set<string>()

/** 53-bit hash over UTF-16 code units. The cache key never keeps the file text. */
function fileContentHash(input: string): string {
  let first = 0xdeadbeef
  let second = 0x41c6ce57
  for (let index = 0; index < input.length; index += 1) {
    const unit = input.charCodeAt(index)
    first = Math.imul(first ^ unit, 2654435761)
    second = Math.imul(second ^ unit, 1597334677)
  }
  first = Math.imul(first ^ (first >>> 16), 2246822507) ^ Math.imul(second ^ (second >>> 13), 3266489909)
  second = Math.imul(second ^ (second >>> 16), 2246822507) ^ Math.imul(first ^ (first >>> 13), 3266489909)
  return (4294967296 * (second & 0x1fffff) + (first >>> 0)).toString(16)
}

export function fileDiffCacheKey(fileName: string, original: string, modified: string): string {
  return `${fileName}\0${original.length}:${fileContentHash(original)}\0${modified.length}:${fileContentHash(modified)}`
}

export function clearFileHunkCache(): void {
  diffCache.clear()
  tooLargeKeys.clear()
}

function remember(key: string, diff: FileDiffMetadata) {
  diffCache.set(key, diff)
  if (diffCache.size > DIFF_CACHE_LIMIT) {
    const oldest = diffCache.keys().next().value
    if (oldest !== undefined) diffCache.delete(oldest)
  }
}

function rememberTooLarge(key: string) {
  tooLargeKeys.add(key)
  if (tooLargeKeys.size > TOO_LARGE_LIMIT) {
    const oldest = tooLargeKeys.values().next().value
    if (oldest !== undefined) tooLargeKeys.delete(oldest)
  }
}

/** `diff` is null for two empty sides: binary and too-large placeholders are not a diff. */
export type FileDiffSnapshot =
  | { status: "ready"; diff: FileDiffMetadata | null }
  | { status: "too-large" }
  | { status: "pending" }

/**
 * Returns the diff without blocking: a cached parse, a synchronous parse of a small input, the
 * remembered timeout, or `pending` when only `loadFileDiff` can produce it.
 */
export function peekFileDiff(original: string, modified: string, fileName = "", key?: string): FileDiffSnapshot {
  if (original.length === 0 && modified.length === 0) return { status: "ready", diff: null }
  const cacheKey = key ?? fileDiffCacheKey(fileName, original, modified)
  const cached = diffCache.get(cacheKey)
  if (cached) {
    diffCache.delete(cacheKey)
    diffCache.set(cacheKey, cached)
    return { status: "ready", diff: cached }
  }
  if (tooLargeKeys.has(cacheKey)) return { status: "too-large" }
  if (original.length + modified.length > SYNC_PARSE_MAX_CHARACTERS) return { status: "pending" }
  const diff = parseDiffFromFile({ name: fileName, contents: original }, { name: fileName, contents: modified })
  remember(cacheKey, diff)
  return { status: "ready", diff }
}

/**
 * Resolves the shared parse, computing large inputs in the diff Worker. Rejects with a
 * `DiffParseError`: `too-large` after the Worker timeout, `aborted`, `busy` or `error`.
 */
export async function loadFileDiff(
  original: string,
  modified: string,
  fileName = "",
  signal?: AbortSignal,
): Promise<FileDiffMetadata | null> {
  const key = fileDiffCacheKey(fileName, original, modified)
  const snapshot = peekFileDiff(original, modified, fileName, key)
  if (snapshot.status === "ready") return snapshot.diff
  if (snapshot.status === "too-large") throw new DiffParseError("too-large")
  try {
    const diff = await diffParseClient.parse(key, fileName, original, modified, signal)
    remember(key, diff)
    return diff
  } catch (error) {
    if (error instanceof DiffParseError && error.reason === "too-large") rememberTooLarge(key)
    throw error
  }
}

/**
 * Reconstructs the file's full content with a single hunk reverted back to
 * `original`, leaving every other hunk's change untouched. `modified` is
 * assumed to already be on disk (the agent writes changes directly), so this
 * is a revert, not a pre-apply "reject" the way Copilot Edits/Zed use the term.
 *
 * Synchronous on purpose: hunk rows exist only once the shared parse is ready, so the diff is
 * already cached. Awaiting a parse here would open a window in which the file can change on disk
 * and the write would then be built from stale contents. Throws a `DiffParseError` if the diff is
 * not available yet (or timed out).
 */
export function revertHunk(original: string, modified: string, hunkIndex: number, fileName = ""): string {
  const snapshot = peekFileDiff(original, modified, fileName)
  if (snapshot.status !== "ready") throw new DiffParseError(snapshot.status === "too-large" ? "too-large" : "error")
  const diff = snapshot.diff
  if (!diff) throw new Error("revertHunk: no diff between two empty files")
  // diffAcceptRejectHunk copies into a new diff, so the cached parse stays intact.
  // Each entry in `additionLines` already carries its own trailing "\n" (the
  // last line doesn't, matching whether the file ends with a newline) — join
  // with "" here, not "\n", or every line gets doubled.
  const resolved = diffAcceptRejectHunk(diff, hunkIndex, "reject")
  return resolved.additionLines.join("")
}
