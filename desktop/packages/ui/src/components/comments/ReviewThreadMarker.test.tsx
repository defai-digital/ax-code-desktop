import { afterEach, describe, expect, test, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@/test/dom"
import type { ReviewThread } from "@/stores/useReviewThreadStore"
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      params ? `${key}:${Object.values(params).join("|")}` : key,
  }),
}))
import { buildPierreLineAnnotations, toPierreAnnotationId } from "./PierreDiffCommentUtils"
import { ReviewThreadMarker } from "./ReviewThreadMarker"

const thread = (id: string, side: ReviewThread["side"]): ReviewThread => ({
  id,
  sessionKey: "k",
  source: "diff",
  fileLabel: "src/a.ts",
  startLine: 3,
  endLine: 4,
  side,
  code: "x",
  language: "ts",
  text: "Rename this",
  createdAt: 1,
  recipientSessionId: "ses",
  status: "open",
  sentAt: 2,
})

afterEach(() => cleanup())

describe("review thread markers", () => {
  test("annotate the re-anchored end line on the thread's own side", () => {
    const annotations = buildPierreLineAnnotations({
      drafts: [],
      editingDraftId: null,
      selection: null,
      threads: [
        { thread: thread("m", "modified"), startLine: 10, endLine: 12 },
        { thread: thread("o", "original"), startLine: 1, endLine: 1 },
      ],
    })
    expect(annotations.map((entry) => [entry.lineNumber, entry.side, toPierreAnnotationId(entry.metadata)])).toEqual([
      [12, "additions", "thread-m"],
      [1, "deletions", "thread-o"],
    ])
  })

  test("show the note at its current lines and resolve it", () => {
    const onResolve = vi.fn()
    render(<ReviewThreadMarker anchored={{ thread: thread("m", "modified"), startLine: 10, endLine: 12 }} onResolve={onResolve} />)
    const note = screen.getByRole("note", { name: "diffView.threads.marker:10|12" })
    expect(note.textContent).toContain("Rename this")
    fireEvent.click(screen.getByRole("button", { name: "diffView.threads.resolve" }))
    expect(onResolve).toHaveBeenCalledWith("m")
  })
})
