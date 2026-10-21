import { describe, expect, test } from "vitest"

import {
  adjacentReviewHunk,
  crossFileReviewHunk,
  resolveReviewHunkIndex,
  reviewHunkAnchors,
  reviewHunkIndexForAnchor,
  type ReviewHunkFile,
} from "./reviewHunkNavigation"

const files: ReviewHunkFile[] = [
  { path: "src/a.ts", hunkCount: 2 },
  { path: "src/b.ts", hunkCount: 1 },
  { path: "src/c.ts", hunkCount: 3 },
]

describe("review hunk index", () => {
  test("steps within a file, then into the next file's first hunk", () => {
    const first = adjacentReviewHunk(files, { path: "src/a.ts", hunkIndex: 0 }, 1)
    expect(first).toEqual({ path: "src/a.ts", hunkIndex: 1 })
    const crossed = adjacentReviewHunk(files, { path: "src/a.ts", hunkIndex: 1 }, 1)
    expect(crossed).toEqual({ path: "src/b.ts", hunkIndex: 0 })
  })

  test("steps back across files onto the previous file's last hunk", () => {
    const crossed = adjacentReviewHunk(files, { path: "src/b.ts", hunkIndex: 0 }, -1)
    expect(crossed).toEqual({ path: "src/a.ts", hunkIndex: 1 })
    const within = adjacentReviewHunk(files, { path: "src/c.ts", hunkIndex: 2 }, -1)
    expect(within).toEqual({ path: "src/c.ts", hunkIndex: 1 })
  })

  test("does not wrap at either end", () => {
    expect(adjacentReviewHunk(files, { path: "src/c.ts", hunkIndex: 2 }, 1)).toBeNull()
    expect(adjacentReviewHunk(files, { path: "src/a.ts", hunkIndex: 0 }, -1)).toBeNull()
    expect(crossFileReviewHunk(files, 0, -1)).toBeNull()
    expect(crossFileReviewHunk(files, files.length - 1, 1)).toBeNull()
  })

  test("skips files with no hunks and stops on a file that has not been measured", () => {
    const withGap: ReviewHunkFile[] = [
      { path: "src/a.ts", hunkCount: 1 },
      { path: "logo.png", hunkCount: 0 },
      { path: "src/b.ts", hunkCount: null },
    ]
    expect(adjacentReviewHunk(withGap, { path: "src/a.ts", hunkIndex: 0 }, 1)).toEqual({
      path: "src/b.ts",
      hunkIndex: "first",
    })
    expect(adjacentReviewHunk(withGap, { path: "src/b.ts", hunkIndex: 0 }, -1)).toEqual({
      path: "src/a.ts",
      hunkIndex: 0,
    })
  })

  test("enters the selected file forward and the previous file backward when nothing is focused", () => {
    expect(adjacentReviewHunk(files, null, 1, "src/b.ts")).toEqual({ path: "src/b.ts", hunkIndex: 0 })
    expect(adjacentReviewHunk(files, null, -1, "src/b.ts")).toEqual({ path: "src/a.ts", hunkIndex: 1 })
    expect(adjacentReviewHunk(files, null, -1, null)).toBeNull()
    expect(adjacentReviewHunk([], null, 1, "src/a.ts")).toBeNull()
  })

  test("resolves edges once a count is known", () => {
    expect(resolveReviewHunkIndex(0, "first")).toBeNull()
    expect(resolveReviewHunkIndex(3, "first")).toBe(0)
    expect(resolveReviewHunkIndex(3, "last")).toBe(2)
    expect(resolveReviewHunkIndex(3, 4)).toBeNull()
  })

  test("anchors the first changed line, preferring additions after context", () => {
    expect(
      reviewHunkAnchors([
        {
          additionStart: 10,
          deletionStart: 8,
          additionLines: 2,
          deletionLines: 1,
          hunkContent: [
            { type: "context", lines: 2 },
            { type: "change", additions: 1, deletions: 1 },
          ],
        },
        {
          additionStart: 1,
          deletionStart: 4,
          additionLines: 0,
          deletionLines: 2,
          hunkContent: [{ type: "change", additions: 0, deletions: 2 }],
        },
      ]),
    ).toEqual([
      { line: 12, side: "additions" },
      { line: 4, side: "deletions" },
    ])
  })

  test("keeps the hunk span and header so a later parse can find the same change", () => {
    expect(
      reviewHunkAnchors([
        {
          additionStart: 10,
          deletionStart: 10,
          additionLines: 1,
          deletionLines: 1,
          additionCount: 4,
          deletionCount: 4,
          hunkSpecs: "@@ -10,4 +10,4 @@",
          hunkContext: "function load",
          hunkContent: [
            { type: "context", lines: 2 },
            { type: "change", additions: 1, deletions: 1 },
          ],
        },
      ]),
    ).toEqual([
      {
        line: 12,
        side: "additions",
        additionStart: 10,
        additionEnd: 13,
        deletionStart: 10,
        deletionEnd: 13,
        header: "@@ -10,4 +10,4 @@ function load",
      },
    ])
  })
})

describe("review hunk anchor resolution", () => {
  test("prefers the hunk that contains the line over a nearer hunk header", () => {
    const index = reviewHunkIndexForAnchor(
      [
        { line: 14, side: "additions", additionStart: 14, additionEnd: 14 },
        { line: 20, side: "additions", additionStart: 15, additionEnd: 25 },
      ],
      { line: 15, side: "additions" },
      0,
    )
    expect(index).toBe(1)
  })

  test("uses the nearest hunk when the line is no longer inside one", () => {
    const index = reviewHunkIndexForAnchor(
      [
        { line: 4, side: "additions", additionStart: 4, additionEnd: 6 },
        { line: 30, side: "additions", additionStart: 30, additionEnd: 32 },
      ],
      { line: 100, side: "additions" },
    )
    expect(index).toBe(1)
  })
})
