import { diffAcceptRejectHunk, parseDiffFromFile, type FileContents, type Hunk } from "@pierre/diffs"

function toFileContents(fileName: string, contents: string): FileContents {
  return { name: fileName, contents }
}

const EMPTY_HUNKS: Hunk[] = []
const HUNK_CACHE_LIMIT = 64
const hunkCache = new Map<string, Hunk[]>()

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

function fileHunkCacheKey(fileName: string, original: string, modified: string): string {
  return `${fileName}\0${original.length}:${fileContentHash(original)}\0${modified.length}:${fileContentHash(modified)}`
}

export function clearFileHunkCache(): void {
  hunkCache.clear()
}

/**
 * Parses `original`/`modified` (full file contents) into per-hunk metadata.
 * One entry per path and content hash, shared by the hunk list and review navigation.
 * Two empty sides are not a diff: binary and too-large placeholders skip the parse.
 */
export function getFileHunks(original: string, modified: string, fileName = ""): Hunk[] {
  if (original.length === 0 && modified.length === 0) return EMPTY_HUNKS
  const key = fileHunkCacheKey(fileName, original, modified)
  const cached = hunkCache.get(key)
  if (cached) {
    hunkCache.delete(key)
    hunkCache.set(key, cached)
    return cached
  }
  const hunks = parseDiffFromFile(toFileContents(fileName, original), toFileContents(fileName, modified)).hunks
  hunkCache.set(key, hunks)
  if (hunkCache.size > HUNK_CACHE_LIMIT) {
    const oldest = hunkCache.keys().next().value
    if (oldest !== undefined) hunkCache.delete(oldest)
  }
  return hunks
}

/**
 * Reconstructs the file's full content with a single hunk reverted back to
 * `original`, leaving every other hunk's change untouched. `modified` is
 * assumed to already be on disk (the agent writes changes directly), so this
 * is a revert, not a pre-apply "reject" the way Copilot Edits/Zed use the term.
 */
export function revertHunk(original: string, modified: string, hunkIndex: number, fileName = ""): string {
  const diff = parseDiffFromFile(toFileContents(fileName, original), toFileContents(fileName, modified))
  // Each entry in `additionLines` already carries its own trailing "\n" (the
  // last line doesn't, matching whether the file ends with a newline) — join
  // with "" here, not "\n", or every line gets doubled.
  const resolved = diffAcceptRejectHunk(diff, hunkIndex, "reject")
  return resolved.additionLines.join("")
}
