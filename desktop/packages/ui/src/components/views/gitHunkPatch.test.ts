import { describe, expect, test } from "vitest"
import { buildHunkPatch, parseFileDiffHunks } from "./gitHunkPatch"

// Two edits far enough apart that git keeps them as separate hunks at -U4.
const twoHunkDiff = [
  "diff --git a/src/a.ts b/src/a.ts",
  "index 1111111..2222222 100644",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -1,6 +1,6 @@",
  " line1",
  "-line2",
  "+line2-edited",
  " line3",
  " line4",
  " line5",
  " line6",
  "@@ -24,7 +24,7 @@",
  " line23",
  " line24",
  " line25",
  "-line26",
  "+line26-edited",
  " line27",
  " line28",
  " line29",
  " line30",
  "",
].join("\n")

describe("parseFileDiffHunks", () => {
  test("parses start lines and counts from every hunk header", () => {
    expect(parseFileDiffHunks(twoHunkDiff)).toEqual([
      { header: "@@ -1,6 +1,6 @@", oldStart: 1, oldCount: 6, newStart: 1, newCount: 6 },
      { header: "@@ -24,7 +24,7 @@", oldStart: 24, oldCount: 7, newStart: 24, newCount: 7 },
    ])
  })

  test("defaults an omitted count to one, matching git", () => {
    const diff = ["--- a/f", "+++ b/f", "@@ -5 +5 @@", "-a", "+b", ""].join("\n")
    expect(parseFileDiffHunks(diff)).toEqual([
      { header: "@@ -5 +5 @@", oldStart: 5, oldCount: 1, newStart: 5, newCount: 1 },
    ])
  })

  test("returns an empty list for a binary diff or empty text", () => {
    const binaryDiff = ["diff --git a/logo.png b/logo.png", "Binary files a/logo.png and b/logo.png differ", ""].join(
      "\n",
    )
    expect(parseFileDiffHunks(binaryDiff)).toEqual([])
    expect(parseFileDiffHunks("")).toEqual([])
  })
})

describe("buildHunkPatch", () => {
  test("extracts the second hunk with the file header and exactly one hunk body", () => {
    const patch = buildHunkPatch(twoHunkDiff, 1)
    expect(patch).toBe(
      [
        "diff --git a/src/a.ts b/src/a.ts",
        "index 1111111..2222222 100644",
        "--- a/src/a.ts",
        "+++ b/src/a.ts",
        "@@ -24,7 +24,7 @@",
        " line23",
        " line24",
        " line25",
        "-line26",
        "+line26-edited",
        " line27",
        " line28",
        " line29",
        " line30",
        "",
      ].join("\n"),
    )
  })

  test("extracts the first hunk of a two-hunk diff", () => {
    const patch = buildHunkPatch(twoHunkDiff, 0)
    expect(patch).toContain("@@ -1,6 +1,6 @@")
    expect(patch).toContain("+line2-edited")
    expect(patch).not.toContain("@@ -24,7 +24,7 @@")
    expect(patch).not.toContain("line26-edited")
  })

  test("keeps the new file mode header for a new file patch", () => {
    const newFileDiff = [
      "diff --git a/new.ts b/new.ts",
      "new file mode 100644",
      "index 0000000..3333333",
      "--- /dev/null",
      "+++ b/new.ts",
      "@@ -0,0 +1,2 @@",
      "+alpha",
      "+beta",
      "",
    ].join("\n")

    const patch = buildHunkPatch(newFileDiff, 0)
    expect(patch).toBe(
      [
        "diff --git a/new.ts b/new.ts",
        "new file mode 100644",
        "index 0000000..3333333",
        "--- /dev/null",
        "+++ b/new.ts",
        "@@ -0,0 +1,2 @@",
        "+alpha",
        "+beta",
        "",
      ].join("\n"),
    )
  })

  test("keeps a deletion-only hunk intact", () => {
    const deletionDiff = [
      "diff --git a/f.txt b/f.txt",
      "--- a/f.txt",
      "+++ b/f.txt",
      "@@ -2,3 +2,2 @@",
      " keep1",
      "-gone",
      " keep2",
      "",
    ].join("\n")

    const patch = buildHunkPatch(deletionDiff, 0)
    expect(patch).toContain("-gone")
    // A body addition line is a single "+"; the "+++ b/…" header line is not one.
    expect(patch).not.toMatch(/^\+(?!\+)/m)
  })

  test("keeps the no-newline-at-EOF marker attached to its hunk", () => {
    const noNewlineDiff = [
      "diff --git a/f.txt b/f.txt",
      "--- a/f.txt",
      "+++ b/f.txt",
      "@@ -1,2 +1,2 @@",
      " line1",
      "-old",
      "\\ No newline at end of file",
      "+new",
      "\\ No newline at end of file",
      "@@ -10,3 +10,3 @@",
      " other",
      "",
    ].join("\n")

    const patch = buildHunkPatch(noNewlineDiff, 0)
    expect(patch).toContain("\\ No newline at end of file")
    expect(patch).not.toContain("@@ -10,3 +10,3 @@")
  })

  test("returns null for an out-of-range index, hunkless or empty input", () => {
    expect(buildHunkPatch(twoHunkDiff, 2)).toBeNull()
    expect(buildHunkPatch(twoHunkDiff, -1)).toBeNull()
    expect(buildHunkPatch("diff --git a/x b/x\nBinary files differ\n", 0)).toBeNull()
    expect(buildHunkPatch("", 0)).toBeNull()
  })
})
