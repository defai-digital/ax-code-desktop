import { describe, expect, it } from "vitest"

import {
  boardComments,
  boardItemKey,
  buildBoardListOptions,
  defaultBoardFilters,
  labelChipStyle,
  visibleLabels,
} from "./boardModel"

describe("github board filters", () => {
  it("starts each tab on the first page of open items", () => {
    expect(defaultBoardFilters("issues")).toEqual({ kind: "issues", state: "open", label: "", query: "", page: 1 })
    expect(buildBoardListOptions(defaultBoardFilters("pulls"))).toEqual({ page: 1, state: "open" })
  })

  it("sends a label and search text only when they are non-empty", () => {
    expect(
      buildBoardListOptions({
        kind: "issues",
        state: "closed",
        label: "  bug  ",
        query: "  login  ",
        page: 2,
      }),
    ).toEqual({ page: 2, state: "closed", label: "bug", q: "login" })
    expect(
      buildBoardListOptions({ kind: "issues", state: "open", label: " ", query: "", page: 0 }),
    ).toEqual({ page: 1, state: "open" })
  })

  it("keeps merged as its own pull request state", () => {
    expect(buildBoardListOptions({ kind: "pulls", state: "merged", query: "fix", page: 3 })).toEqual({
      page: 3,
      state: "merged",
      q: "fix",
    })
  })

  it("keys an item by its source repository and number", () => {
    expect(boardItemKey({ number: 4, sourceRepo: { owner: "acme", repo: "app" } })).toBe("acme/app#4")
    expect(boardItemKey({ number: 4 })).toBe("/#4")
  })
})

describe("github label colors", () => {
  it("uses dark text on a light fill and light text on a dark fill", () => {
    expect(labelChipStyle("ededed")).toEqual({ backgroundColor: "#ededed", color: "#1c1917" })
    expect(labelChipStyle("#d73a4a")).toEqual({ backgroundColor: "#d73a4a", color: "#fafaf9" })
    expect(labelChipStyle("fff")?.color).toBe("#1c1917")
  })

  it("rejects missing and malformed colors", () => {
    expect(labelChipStyle(undefined)).toBeNull()
    expect(labelChipStyle("red")).toBeNull()
    expect(labelChipStyle("12345")).toBeNull()
  })

  it("caps the labels shown on a row", () => {
    expect(visibleLabels(["a", "b"], 4)).toEqual({ shown: ["a", "b"], extra: 0 })
    expect(visibleLabels(["a", "b", "c"], 2)).toEqual({ shown: ["a", "b"], extra: 1 })
  })
})

describe("github board comments", () => {
  it("merges issue and review comments in time order", () => {
    const comments = boardComments({
      issueComments: [
        { id: 2, url: "https://example.test/2", body: "later", createdAt: "2026-02-01T00:00:00Z", author: { login: "bea", id: 2 } },
      ],
      reviewComments: [
        { id: 2, url: "https://example.test/r", body: "earlier", createdAt: "2026-01-01T00:00:00Z", author: { login: "ada", id: 1 } },
      ],
    })
    expect(comments.map((comment) => comment.id)).toEqual(["review:2", "issue:2"])
    expect(comments[0]?.authorLogin).toBe("ada")
  })
})
