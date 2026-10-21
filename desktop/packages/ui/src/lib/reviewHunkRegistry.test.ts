import { afterEach, describe, expect, test } from "vitest"

import type { ReviewHunkAnchor } from "./reviewHunkNavigation"
import {
  clearReviewHunkFocus,
  commitReviewHunkFocus,
  getReviewHunkAnchors,
  getReviewHunkFocus,
  publishReviewHunks,
  resetReviewHunkNavigation,
  reviewPaneScopeKey,
  setReviewHunkPending,
  takeReviewHunkResume,
} from "./reviewHunkRegistry"

const anchors = (count: number): ReviewHunkAnchor[] =>
  Array.from({ length: count }, (_, index) => ({ line: (index + 1) * 10, side: "additions" as const }))

const span = (line: number, end = line): ReviewHunkAnchor => ({
  line,
  side: "additions",
  additionStart: line,
  additionEnd: end,
})

describe("review hunk registry", () => {
  afterEach(() => {
    resetReviewHunkNavigation()
  })

  test("one pane's publish and clear do not move another pane on the same path", () => {
    publishReviewHunks("pane-a", "/repo", "src/a.ts", anchors(3))
    publishReviewHunks("pane-b", "/repo", "src/a.ts", anchors(1))
    commitReviewHunkFocus("pane-a", "/repo", "src/a.ts", 2)
    commitReviewHunkFocus("pane-b", "/repo", "src/a.ts", 0)

    publishReviewHunks("pane-b", "/repo", "src/a.ts", anchors(1))
    clearReviewHunkFocus("pane-a")

    expect(getReviewHunkFocus("pane-a")).toBeNull()
    expect(getReviewHunkAnchors("pane-a", "/repo", "src/a.ts")).toHaveLength(3)
    expect(getReviewHunkFocus("pane-b")).toMatchObject({ path: "src/a.ts", hunkIndex: 0, directory: "/repo" })
    expect(getReviewHunkAnchors("pane-b", "/repo", "src/a.ts")).toHaveLength(1)
  })

  test("a zero-hunk resume stays inside the pane that was waiting", () => {
    setReviewHunkPending("pane-a", { directory: "/repo", path: "src/b.ts", hunkIndex: "first", direction: 1 })
    setReviewHunkPending("pane-b", { directory: "/repo", path: "src/b.ts", hunkIndex: "first", direction: 1 })
    publishReviewHunks("pane-a", "/repo", "src/b.ts", [])

    expect(takeReviewHunkResume("pane-a")).toEqual({ directory: "/repo", path: "src/b.ts", direction: 1 })
    expect(takeReviewHunkResume("pane-b")).toBeNull()
  })

  test("publishing the same path in another repository does not reuse the cursor", () => {
    publishReviewHunks("pane", "/repo-a", "src/app.ts", anchors(5))
    commitReviewHunkFocus("pane", "/repo-a", "src/app.ts", 4)
    publishReviewHunks("pane", "/repo-b", "src/app.ts", anchors(1))

    expect(getReviewHunkFocus("pane")).toMatchObject({
      directory: "/repo-a",
      path: "src/app.ts",
      hunkIndex: 4,
      anchor: { line: 50, side: "additions" },
    })
    expect(getReviewHunkAnchors("pane", "/repo-a", "src/app.ts")).toHaveLength(5)
    expect(getReviewHunkAnchors("pane", "/repo-b", "src/app.ts")).toHaveLength(1)
    expect(reviewPaneScopeKey("/repo-a", "git:all")).not.toBe(reviewPaneScopeKey("/repo-b", "git:all"))
  })

  test("republish follows the focused line when a hunk is inserted above it", () => {
    publishReviewHunks("pane", "/repo", "src/app.ts", [span(10), span(100, 110)])
    commitReviewHunkFocus("pane", "/repo", "src/app.ts", 1)

    publishReviewHunks("pane", "/repo", "src/app.ts", [span(10), span(40, 48), span(100, 110)])

    expect(getReviewHunkFocus("pane")).toMatchObject({
      hunkIndex: 2,
      anchor: { line: 100, side: "additions" },
    })
  })

  test("republish lands on the hunk that contains the focused line", () => {
    publishReviewHunks("pane", "/repo", "src/app.ts", [span(15)])
    commitReviewHunkFocus("pane", "/repo", "src/app.ts", 0)

    publishReviewHunks("pane", "/repo", "src/app.ts", [
      span(14),
      { line: 20, side: "additions", additionStart: 15, additionEnd: 25 },
    ])

    expect(getReviewHunkFocus("pane")?.hunkIndex).toBe(1)
    expect(getReviewHunkFocus("pane")?.anchor).toEqual({ line: 15, side: "additions" })
  })
})
