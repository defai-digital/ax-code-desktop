/**
 * Hunk-level review locomotion. File order is the review rail. A step never wraps:
 * the ends return null so the caller stays put.
 *
 * `hunkCount` is null until that file's diff has been measured. Zero means the file
 * has no navigable change (binary, image, or an empty diff) and is skipped.
 */

export type ReviewHunkFile = {
  path: string
  hunkCount: number | null
}

export type ReviewHunkCursor = {
  path: string
  /** Zero-based index of the focused hunk in that file. */
  hunkIndex: number
}

export type ReviewHunkTarget = {
  path: string
  /** A concrete index when the destination count is known, otherwise an edge resolved after it renders. */
  hunkIndex: number | "first" | "last"
}

export type ReviewHunkContent =
  | { type: "context"; lines: number }
  | { type: "change"; additions: number; deletions: number }

/** The fields of a Pierre hunk this module needs. The renderer owns the full hunk. */
export type ReviewHunkSource = {
  additionStart: number
  deletionStart: number
  additionLines: number
  deletionLines: number
  hunkContent: readonly ReviewHunkContent[]
  /** Total new-side lines, including context. Present on a parsed Pierre hunk. */
  additionCount?: number
  /** Total old-side lines, including context. Present on a parsed Pierre hunk. */
  deletionCount?: number
  /** Raw `@@` header. */
  hunkSpecs?: string
  /** Function name that follows the header, when the diff recorded one. */
  hunkContext?: string
}

export type ReviewHunkAnchor = {
  /** 1-based line on `side` — the first changed line of the hunk. */
  line: number
  side: "additions" | "deletions"
  /** Inclusive hunk span on the new side, when the parse reported a count. */
  additionStart?: number
  additionEnd?: number
  /** Inclusive hunk span on the old side, when the parse reported a count. */
  deletionStart?: number
  deletionEnd?: number
  /** Header text announced with the focused change. */
  header?: string
}

function changedLine(hunk: ReviewHunkSource): Pick<ReviewHunkAnchor, "line" | "side"> {
  let additionLine = hunk.additionStart
  let deletionLine = hunk.deletionStart
  for (const segment of hunk.hunkContent) {
    if (segment.type === "context") {
      additionLine += segment.lines
      deletionLine += segment.lines
      continue
    }
    if (segment.additions > 0) return { line: additionLine, side: "additions" }
    if (segment.deletions > 0) return { line: deletionLine, side: "deletions" }
  }
  if (hunk.additionLines > 0) return { line: hunk.additionStart, side: "additions" }
  return { line: Math.max(1, hunk.deletionStart), side: "deletions" }
}

function hunkHeader(hunk: ReviewHunkSource): string {
  const spec = hunk.hunkSpecs?.trim() ?? ""
  const context = hunk.hunkContext?.trim() ?? ""
  return [spec, context].filter(Boolean).join(" ")
}

/**
 * First changed line of each hunk. Additions win when a change block has both sides,
 * so unified and split views scroll to the same change. The span and header travel
 * with the anchor so a later parse can find this change again.
 */
export function reviewHunkAnchors(hunks: readonly ReviewHunkSource[]): ReviewHunkAnchor[] {
  return hunks.map((hunk) => {
    const anchor: ReviewHunkAnchor = { ...changedLine(hunk) }
    const header = hunkHeader(hunk)
    if (header) anchor.header = header
    if (typeof hunk.additionCount === "number" && hunk.additionCount > 0) {
      anchor.additionStart = hunk.additionStart
      anchor.additionEnd = hunk.additionStart + hunk.additionCount - 1
    }
    if (typeof hunk.deletionCount === "number" && hunk.deletionCount > 0) {
      anchor.deletionStart = hunk.deletionStart
      anchor.deletionEnd = hunk.deletionStart + hunk.deletionCount - 1
    }
    return anchor
  })
}

function span(
  hunk: ReviewHunkAnchor,
  side: "additions" | "deletions",
): { start: number; end: number } | null {
  const start = side === "additions" ? hunk.additionStart : hunk.deletionStart
  const end = side === "additions" ? hunk.additionEnd : hunk.deletionEnd
  if (start === undefined || end === undefined || end < start) return null
  return { start, end }
}

function lineDistance(hunk: ReviewHunkAnchor, anchor: Pick<ReviewHunkAnchor, "line" | "side">): number {
  const range = span(hunk, anchor.side) ?? span(hunk, anchor.side === "additions" ? "deletions" : "additions")
  if (!range) return Math.abs(hunk.line - anchor.line)
  if (anchor.line < range.start) return range.start - anchor.line
  if (anchor.line > range.end) return anchor.line - range.end
  return 0
}

/**
 * Hunk that contains `anchor`, or the nearest hunk when the line sits in a gap.
 * `previousIndex` wins a tie so an unchanged hunk does not jump to a neighbor.
 */
export function reviewHunkIndexForAnchor(
  anchors: readonly ReviewHunkAnchor[],
  anchor: Pick<ReviewHunkAnchor, "line" | "side">,
  previousIndex?: number,
): number | null {
  if (anchors.length === 0) return null
  const current = previousIndex !== undefined && previousIndex >= 0 && previousIndex < anchors.length ? previousIndex : -1
  let best = 0
  let bestDistance = lineDistance(anchors[0], anchor)
  for (let index = 1; index < anchors.length; index += 1) {
    const gap = lineDistance(anchors[index], anchor)
    if (gap < bestDistance) {
      best = index
      bestDistance = gap
      continue
    }
    if (gap !== bestDistance) continue
    if (index === current) {
      best = index
      continue
    }
    if (best === current) continue
    const sideMatch = anchors[index].side === anchor.side
    const bestSide = anchors[best].side === anchor.side
    if (sideMatch && !bestSide) best = index
  }
  return best
}

/** Resolves an edge once the file's hunk count is known. Null when the file has no hunks. */
export function resolveReviewHunkIndex(hunkCount: number, target: number | "first" | "last"): number | null {
  if (hunkCount <= 0) return null
  if (target === "first") return 0
  if (target === "last") return hunkCount - 1
  if (!Number.isInteger(target) || target < 0 || target >= hunkCount) return null
  return target
}

/**
 * The file after `index` in `direction`, skipping files with no hunks.
 * Unknown files stop the walk: their edge is resolved when they render.
 */
export function crossFileReviewHunk(
  files: readonly ReviewHunkFile[],
  index: number,
  direction: -1 | 1,
): ReviewHunkTarget | null {
  const step = direction > 0 ? 1 : -1
  for (let cursor = index + step; cursor >= 0 && cursor < files.length; cursor += step) {
    const file = files[cursor]
    if (!file) continue
    if (file.hunkCount === 0) continue
    if (file.hunkCount === null) {
      return { path: file.path, hunkIndex: direction > 0 ? "first" : "last" }
    }
    return { path: file.path, hunkIndex: direction > 0 ? 0 : file.hunkCount - 1 }
  }
  return null
}

function enterReviewHunk(
  files: readonly ReviewHunkFile[],
  direction: -1 | 1,
  selectedPath: string | null,
): ReviewHunkTarget | null {
  if (direction < 0) {
    if (!selectedPath) return null
    const index = files.findIndex((file) => file.path === selectedPath)
    if (index < 0) return null
    return crossFileReviewHunk(files, index, -1)
  }

  const selectedIndex = selectedPath ? files.findIndex((file) => file.path === selectedPath) : 0
  const start = selectedIndex < 0 ? 0 : selectedIndex
  const file = files[start]
  if (!file) return null
  if (file.hunkCount === 0) return crossFileReviewHunk(files, start, 1)
  if (file.hunkCount === null) return { path: file.path, hunkIndex: "first" }
  return { path: file.path, hunkIndex: 0 }
}

/**
 * Next or previous change hunk. Null cursor with a selected file enters that file
 * (forward) or the previous file's last hunk (backward). Null at either end means
 * stay — navigation does not wrap.
 */
export function adjacentReviewHunk(
  files: readonly ReviewHunkFile[],
  cursor: ReviewHunkCursor | null,
  direction: -1 | 1,
  selectedPath: string | null = null,
): ReviewHunkTarget | null {
  if (files.length === 0) return null
  if (!cursor) return enterReviewHunk(files, direction, selectedPath)

  const index = files.findIndex((file) => file.path === cursor.path)
  if (index < 0) return enterReviewHunk(files, direction, selectedPath ?? cursor.path)

  const file = files[index]
  if (!file || file.hunkCount === 0 || file.hunkCount === null) {
    return file ? crossFileReviewHunk(files, index, direction) : null
  }

  if (direction > 0) {
    if (cursor.hunkIndex + 1 < file.hunkCount) {
      return { path: file.path, hunkIndex: cursor.hunkIndex + 1 }
    }
    return crossFileReviewHunk(files, index, 1)
  }

  if (cursor.hunkIndex >= file.hunkCount) {
    return { path: file.path, hunkIndex: file.hunkCount - 1 }
  }
  if (cursor.hunkIndex > 0) {
    return { path: file.path, hunkIndex: cursor.hunkIndex - 1 }
  }
  return crossFileReviewHunk(files, index, -1)
}
