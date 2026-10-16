/** A single `@@` hunk of a unified diff for one file. */
export type FileDiffHunk = {
  /** The hunk's `@@` header line, verbatim. */
  header: string
  /** Old-side start line parsed from `-X`. */
  oldStart: number
  /** Old-side line count parsed from `-X,Y`; git omits `,Y` when it is 1. */
  oldCount: number
  /** New-side start line parsed from `+X`. */
  newStart: number
  /** New-side line count parsed from `+X,Y`; git omits `,Y` when it is 1. */
  newCount: number
}

const HUNK_HEADER_PATTERN = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

const toCount = (value: string | undefined): number => (value === undefined ? 1 : Number(value))

/**
 * Parses the `@@` headers of a single-file unified diff (`git diff` /
 * `git diff --cached` output) into hunk metadata. Binary diffs carry no
 * hunks and parse to an empty list.
 */
export function parseFileDiffHunks(fileDiffText: string): FileDiffHunk[] {
  const hunks: FileDiffHunk[] = []
  for (const line of String(fileDiffText ?? "").split("\n")) {
    const match = HUNK_HEADER_PATTERN.exec(line)
    if (!match) continue
    hunks.push({
      header: line,
      oldStart: Number(match[1]),
      oldCount: toCount(match[2]),
      newStart: Number(match[3]),
      newCount: toCount(match[4]),
    })
  }
  return hunks
}

/**
 * Builds a single-hunk patch for `git apply`: the file's header lines
 * (`diff --git`, `--- a/…`, `+++ b/…`, …) followed by only the requested
 * hunk's body, keeping any `\ No newline at end of file` marker attached to
 * it. Returns null when the hunk index is out of range or the diff has no
 * hunks (binary files, pure renames, empty diffs).
 */
export function buildHunkPatch(fileDiffText: string, hunkIndex: number): string | null {
  const lines = String(fileDiffText ?? "").split("\n")
  const firstHunkLine = lines.findIndex((line) => line.startsWith("@@ "))
  if (firstHunkLine === -1) return null

  const fileHeaderLines = lines.slice(0, firstHunkLine)
  const hunks: string[][] = []
  for (const line of lines.slice(firstHunkLine)) {
    if (line.startsWith("@@ ")) {
      hunks.push([line])
    } else if (hunks.length > 0) {
      hunks[hunks.length - 1].push(line)
    }
  }

  const hunk = hunks[hunkIndex]
  if (!hunk) return null
  // The split leaves an empty artifact after the trailing newline; drop it so
  // the patch ends with exactly one.
  while (hunk.length > 0 && hunk[hunk.length - 1] === "") {
    hunk.pop()
  }

  return `${fileHeaderLines.join("\n")}\n${hunk.join("\n")}\n`
}
