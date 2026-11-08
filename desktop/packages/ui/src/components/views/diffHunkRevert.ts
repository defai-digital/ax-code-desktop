import {
  diffAcceptRejectHunk,
  parseDiffFromFile,
  type FileContents,
  type FileDiffMetadata,
  type Hunk,
} from "@pierre/diffs"

function toFileContents(fileName: string, contents: string): FileContents {
  return { name: fileName, contents }
}

const EMPTY_HUNKS: Hunk[] = []
const DIFF_CACHE_LIMIT = 64
// Full parse results, so the viewer, the hunk list and hunk revert share one synchronous
// parse. Pierre's line diff is super-linear in edit distance: a 5k-line rewrite measured
// about 1.6 s on the renderer thread (diffHunkRevert.bench.ts), and each consumer used to
// repeat it. Consumers must treat entries as immutable.
const diffCache = new Map<string, FileDiffMetadata>()

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

function fileDiffCacheKey(fileName: string, original: string, modified: string): string {
  return `${fileName}\0${original.length}:${fileContentHash(original)}\0${modified.length}:${fileContentHash(modified)}`
}

export function clearFileHunkCache(): void {
  diffCache.clear()
}

/**
 * Parses `original`/`modified` (full file contents) once per path and content hash.
 * Returns null for two empty sides: binary and too-large placeholders are not a diff.
 */
export function getFileDiff(original: string, modified: string, fileName = ""): FileDiffMetadata | null {
  if (original.length === 0 && modified.length === 0) return null
  const key = fileDiffCacheKey(fileName, original, modified)
  const cached = diffCache.get(key)
  if (cached) {
    diffCache.delete(key)
    diffCache.set(key, cached)
    return cached
  }
  const diff = parseDiffFromFile(toFileContents(fileName, original), toFileContents(fileName, modified))
  diffCache.set(key, diff)
  if (diffCache.size > DIFF_CACHE_LIMIT) {
    const oldest = diffCache.keys().next().value
    if (oldest !== undefined) diffCache.delete(oldest)
  }
  return diff
}

/**
 * Per-hunk metadata for `original`/`modified`, shared by the hunk list and review navigation.
 * Two empty sides are not a diff: binary and too-large placeholders skip the parse.
 */
export function getFileHunks(original: string, modified: string, fileName = ""): Hunk[] {
  return getFileDiff(original, modified, fileName)?.hunks ?? EMPTY_HUNKS
}

/**
 * Reconstructs the file's full content with a single hunk reverted back to
 * `original`, leaving every other hunk's change untouched. `modified` is
 * assumed to already be on disk (the agent writes changes directly), so this
 * is a revert, not a pre-apply "reject" the way Copilot Edits/Zed use the term.
 */
export function revertHunk(original: string, modified: string, hunkIndex: number, fileName = ""): string {
  const diff = getFileDiff(original, modified, fileName)
  if (!diff) throw new Error("revertHunk: no diff between two empty files")
  // diffAcceptRejectHunk copies into a new diff, so the cached parse stays intact.
  // Each entry in `additionLines` already carries its own trailing "\n" (the
  // last line doesn't, matching whether the file ends with a newline) — join
  // with "" here, not "\n", or every line gets doubled.
  const resolved = diffAcceptRejectHunk(diff, hunkIndex, "reject")
  return resolved.additionLines.join("")
}
