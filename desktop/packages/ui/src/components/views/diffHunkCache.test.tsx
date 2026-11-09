import React from "react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { parseDiffFromFile } from "@pierre/diffs"

import { I18nProvider } from "@/lib/i18n"
import { getReviewHunkAnchors, resetReviewHunkNavigation } from "@/lib/reviewHunkRegistry"
import { ReviewHunkScopeProvider } from "@/lib/reviewHunkScope"
import { cleanup, render } from "@/test/dom"

import { clearFileHunkCache, peekFileDiff } from "./diffHunkRevert"
import { DiffHunkReviewList } from "./DiffHunkReviewList"
import { ReviewHunkMeasure } from "./usePublishReviewHunks"

vi.mock("@pierre/diffs", async () => {
  const actual = await vi.importActual<typeof import("@pierre/diffs")>("@pierre/diffs")
  return {
    ...actual,
    parseDiffFromFile: vi.fn(actual.parseDiffFromFile),
  }
})

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => children,
  TooltipContent: () => null,
}))

vi.mock("@/components/icon/Icon", () => ({ Icon: () => <span /> }))

// These inputs are under SYNC_PARSE_MAX_CHARACTERS, so the shared parse is synchronous.
function getFileHunks(before: string, after: string, fileName: string) {
  const snapshot = peekFileDiff(before, after, fileName)
  if (snapshot.status !== "ready") throw new Error(`expected a synchronous parse, got ${snapshot.status}`)
  return snapshot.diff?.hunks ?? []
}

const originalLines = Array.from({ length: 20 }, (_, index) => `line${index + 1}`)
const original = originalLines.join("\n")
const modifiedLines = [...originalLines]
modifiedLines[1] = "line2-edited"
modifiedLines[18] = "line19-edited"
const modified = modifiedLines.join("\n")

describe("file hunk cache", () => {
  beforeEach(() => {
    clearFileHunkCache()
    resetReviewHunkNavigation()
    vi.mocked(parseDiffFromFile).mockClear()
  })

  afterEach(() => {
    cleanup()
    clearFileHunkCache()
    resetReviewHunkNavigation()
  })

  test("parses a file once for the same path and content", () => {
    expect(getFileHunks(original, modified, "src/a.ts")).toHaveLength(2)
    expect(getFileHunks(original, modified, "src/a.ts")).toHaveLength(2)
    expect(parseDiffFromFile).toHaveBeenCalledTimes(1)

    getFileHunks(original, `${modified}\n`, "src/a.ts")
    expect(parseDiffFromFile).toHaveBeenCalledTimes(2)

    getFileHunks(original, modified, "src/b.ts")
    expect(parseDiffFromFile).toHaveBeenCalledTimes(3)
  })

  test("does not parse an empty binary or too-large placeholder", () => {
    expect(getFileHunks("", "", "logo.bin")).toEqual([])
    expect(parseDiffFromFile).not.toHaveBeenCalled()
  })

  test("the hunk list and the review measure share one parse", () => {
    render(
      <ReviewHunkScopeProvider id="pane" directory="/repo">
        <I18nProvider>
          <>
            <DiffHunkReviewList
              original={original}
              modified={modified}
              fileName="src/a.ts"
              onRevertHunk={() => {}}
              revertingHunkIndex={null}
            />
            <ReviewHunkMeasure path="src/a.ts" original={original} modified={modified} />
          </>
        </I18nProvider>
      </ReviewHunkScopeProvider>,
    )

    expect(parseDiffFromFile).toHaveBeenCalledTimes(1)
    expect(getReviewHunkAnchors("pane", "/repo", "src/a.ts")?.length).toBe(2)
  })

  test("a binary measure publishes no hunks without parsing", () => {
    render(
      <ReviewHunkScopeProvider id="pane" directory="/repo">
        <ReviewHunkMeasure path="logo.png" original={null} modified={null} />
      </ReviewHunkScopeProvider>,
    )

    expect(parseDiffFromFile).not.toHaveBeenCalled()
    expect(getReviewHunkAnchors("pane", "/repo", "logo.png")).toEqual([])
  })
})
