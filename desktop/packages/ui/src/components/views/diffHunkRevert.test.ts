import { beforeEach, describe, expect, it, vi } from "vitest"

const parseCalls = vi.hoisted(() => ({ count: 0 }))

vi.mock("@pierre/diffs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@pierre/diffs")>()
  return {
    ...actual,
    parseDiffFromFile: (...args: Parameters<typeof actual.parseDiffFromFile>) => {
      parseCalls.count += 1
      return actual.parseDiffFromFile(...args)
    },
  }
})

const { clearFileHunkCache, getFileDiff, getFileHunks, revertHunk } = await import("./diffHunkRevert")

// 20 unchanged lines with a wide gap between the two edits: this diff library
// merges hunks that are closer than its internal context threshold, so the
// gap here must be large enough to keep them as two distinct hunks.
const lineCount = 20
const originalLines = Array.from({ length: lineCount }, (_, i) => `line${i + 1}`)
const original = originalLines.join("\n")

const modifiedLines = [...originalLines]
modifiedLines[1] = "line2-edited" // near the start
modifiedLines[lineCount - 2] = `line${lineCount - 1}-edited` // near the end
const modified = modifiedLines.join("\n")

describe("diffHunkRevert", () => {
  beforeEach(() => {
    clearFileHunkCache()
    parseCalls.count = 0
  })

  it("shares one parse between the hunk list, the viewer diff and hunk revert", () => {
    const hunks = getFileHunks(original, modified, "file.txt")
    const diff = getFileDiff(original, modified, "file.txt")
    expect(diff?.hunks).toBe(hunks)
    revertHunk(original, modified, 1, "file.txt")
    // The line diff is super-linear in edit distance, so every repeat is a main-thread stall.
    expect(parseCalls.count).toBe(1)
  })

  it("reverting a hunk leaves the shared parse unchanged", () => {
    const diff = getFileDiff(original, modified, "file.txt")
    const snapshot = JSON.stringify(diff)
    revertHunk(original, modified, 0, "file.txt")
    expect(JSON.stringify(getFileDiff(original, modified, "file.txt"))).toBe(snapshot)
    expect(getFileHunks(original, modified, "file.txt")).toHaveLength(2)
  })

  it("does not parse two empty sides", () => {
    expect(getFileDiff("", "", "binary.png")).toBeNull()
    expect(getFileHunks("", "", "binary.png")).toEqual([])
    expect(parseCalls.count).toBe(0)
  })

  it("parses two separate hunks", () => {
    const hunks = getFileHunks(original, modified, "file.txt")
    expect(hunks).toHaveLength(2)
  })

  it("reverts only the targeted hunk, leaving the other intact", () => {
    const reverted = revertHunk(original, modified, 0, "file.txt")
    expect(reverted).toContain("line2\n")
    expect(reverted).not.toContain("line2-edited")
    expect(reverted).toContain(`line${lineCount - 1}-edited`)
  })

  it("reverting the last remaining hunk restores the original file exactly", () => {
    const afterFirstRevert = revertHunk(original, modified, 0, "file.txt")
    const hunksAfterFirstRevert = getFileHunks(original, afterFirstRevert, "file.txt")
    expect(hunksAfterFirstRevert).toHaveLength(1)

    const afterSecondRevert = revertHunk(original, afterFirstRevert, 0, "file.txt")
    expect(afterSecondRevert).toBe(original)
  })
})
