import React, { act } from "react"
import { parseDiffFromFile, type FileDiffMetadata } from "@pierre/diffs"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { I18nProvider } from "@/lib/i18n"
import { getReviewHunkAnchors, resetReviewHunkNavigation } from "@/lib/reviewHunkRegistry"
import { ReviewHunkScopeProvider } from "@/lib/reviewHunkScope"
import { cleanup, render } from "@/test/dom"

import { SYNC_PARSE_MAX_CHARACTERS, clearFileHunkCache, revertHunk } from "./diffHunkRevert"
import { DiffParseError } from "./diffParseClient"
import { DiffHunkReviewList } from "./DiffHunkReviewList"
import { ReviewHunkMeasure } from "./usePublishReviewHunks"
import { useFileDiff } from "./useFileDiff"

interface PendingParse {
  original: string
  modified: string
  signal?: AbortSignal
  resolve: (diff: FileDiffMetadata) => void
  reject: (error: DiffParseError) => void
}

const worker = vi.hoisted(() => ({ calls: [] as PendingParse[] }))

vi.mock("./diffParseClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./diffParseClient")>()
  return {
    ...actual,
    diffParseClient: {
      parse: (_key: string, _name: string, original: string, modified: string, signal?: AbortSignal) =>
        new Promise<FileDiffMetadata>((resolve, reject) => {
          worker.calls.push({ original, modified, signal, resolve, reject })
        }),
    },
  }
})

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => children,
  TooltipContent: () => null,
}))

vi.mock("@/components/icon/Icon", () => ({ Icon: () => <span /> }))

/** A file big enough to take the Worker path, with an edit near each end (two hunks). */
function largePair(tag: string) {
  const lines = Array.from({ length: 600 }, (_, index) => `const value_${index} = compute(${index}) // ${tag}`)
  const original = `${lines.join("\n")}\n`
  const edited = [...lines]
  edited[3] = `${edited[3]} // edited`
  edited[590] = `${edited[590]} // edited`
  return { original, modified: `${edited.join("\n")}\n` }
}

function realParse(call: PendingParse) {
  return parseDiffFromFile({ name: "a.ts", contents: call.original }, { name: "a.ts", contents: call.modified })
}

/** Same-key sharing lives in the real client (diffParseClient.test.ts); this mock answers every caller. */
function answerAll() {
  for (const call of worker.calls) call.resolve(realParse(call))
}

function failAll(reason: "too-large" | "error") {
  for (const call of worker.calls) call.reject(new DiffParseError(reason))
}

function StatusProbe(props: { original: string; modified: string }) {
  const state = useFileDiff(props.original, props.modified, "src/a.ts")
  return <output data-testid="status">{state.status === "ready" ? `ready:${state.diff?.hunks.length}` : state.status}</output>
}

function list(original: string, modified: string) {
  return (
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
    </ReviewHunkScopeProvider>
  )
}

const status = () => document.querySelector("[data-testid=status]")?.textContent

const rows = (container: HTMLElement) => container.querySelectorAll("[data-review-hunk-index]").length

describe("diff parse off the renderer thread", () => {
  beforeEach(() => {
    worker.calls = []
    clearFileHunkCache()
    resetReviewHunkNavigation()
  })

  afterEach(() => {
    cleanup()
    clearFileHunkCache()
    resetReviewHunkNavigation()
  })

  test("a large diff shows no hunk rows or anchors until the Worker answers, then both", async () => {
    const pair = largePair("v1")
    expect(pair.original.length + pair.modified.length).toBeGreaterThan(SYNC_PARSE_MAX_CHARACTERS)
    const { container } = render(list(pair.original, pair.modified))

    expect(rows(container)).toBe(0)
    expect(getReviewHunkAnchors("pane", "/repo", "src/a.ts")).toEqual([])
    await act(async () => answerAll())
    expect(rows(container)).toBe(2)
    expect(getReviewHunkAnchors("pane", "/repo", "src/a.ts")).toHaveLength(2)
  })

  test("a small diff is ready on the first render without the Worker", () => {
    render(<StatusProbe original={"a\nb\n"} modified={"a\nB\n"} />)
    expect(status()).toBe("ready:1")
    expect(worker.calls).toHaveLength(0)
  })

  test("a late answer for earlier contents is discarded", async () => {
    const first = largePair("v1")
    const second = largePair("v2")
    const { rerender } = render(<StatusProbe original={first.original} modified={first.modified} />)
    rerender(<StatusProbe original={second.original} modified={second.modified} />)

    expect(worker.calls[0].signal?.aborted).toBe(true)
    await act(async () => worker.calls[0].resolve(realParse(worker.calls[0])))
    expect(status()).toBe("loading")

    await act(async () => worker.calls[1].resolve(realParse(worker.calls[1])))
    expect(status()).toBe("ready:2")
  })

  test("a timed-out parse shows too-large, offers no actions, and is not retried on remount", async () => {
    const pair = largePair("v1")
    const { container } = render(
      <>
        {list(pair.original, pair.modified)}
        <StatusProbe original={pair.original} modified={pair.modified} />
      </>,
    )
    await act(async () => failAll("too-large"))

    expect(status()).toBe("too-large")
    expect(rows(container)).toBe(0)
    expect(getReviewHunkAnchors("pane", "/repo", "src/a.ts")).toEqual([])

    const requests = worker.calls.length
    cleanup()
    render(<StatusProbe original={pair.original} modified={pair.modified} />)
    expect(status()).toBe("too-large")
    expect(worker.calls).toHaveLength(requests)
    expect(() => revertHunk(pair.original, pair.modified, 0, "src/a.ts")).toThrow(DiffParseError)
  })

  test("a Worker failure shows an error and a remount tries again", async () => {
    const pair = largePair("v1")
    render(<StatusProbe original={pair.original} modified={pair.modified} />)
    await act(async () => worker.calls[0].reject(new DiffParseError("error")))
    expect(status()).toBe("error")

    cleanup()
    render(<StatusProbe original={pair.original} modified={pair.modified} />)
    expect(worker.calls).toHaveLength(2)
  })

  test("coming back to a file whose parse failed shows loading while it retries", async () => {
    const failing = largePair("v1")
    const other = largePair("v2")
    const { rerender } = render(<StatusProbe original={failing.original} modified={failing.modified} />)
    await act(async () => worker.calls[0].reject(new DiffParseError("error")))
    expect(status()).toBe("error")

    rerender(<StatusProbe original={other.original} modified={other.modified} />)
    rerender(<StatusProbe original={failing.original} modified={failing.modified} />)
    expect(status()).toBe("loading")
    expect(worker.calls).toHaveLength(3)
  })

  test("revert does not wait for a parse: without a ready diff it refuses instead of writing later", () => {
    const pair = largePair("v1")
    expect(() => revertHunk(pair.original, pair.modified, 0, "src/a.ts")).toThrow(DiffParseError)
    expect(worker.calls).toHaveLength(0)
  })

  test("revert reuses the parse the view computed", async () => {
    const pair = largePair("v1")
    render(<StatusProbe original={pair.original} modified={pair.modified} />)
    await act(async () => worker.calls[0].resolve(realParse(worker.calls[0])))

    const reverted = revertHunk(pair.original, pair.modified, 0, "src/a.ts")
    expect(worker.calls).toHaveLength(1)
    expect(reverted).not.toContain("value_3 = compute(3) // v1 // edited")
    expect(reverted).toContain("value_590 = compute(590) // v1 // edited")
  })
})
