import React, { act, useRef, useState } from "react"
import { afterEach, beforeEach, describe, expect, test } from "vitest"

import { I18nProvider } from "@/lib/i18n"
import { dict } from "@/lib/i18n/messages/en"
import type { ReviewHunkAnchor } from "@/lib/reviewHunkNavigation"
import {
  getReviewHunkAnnouncement,
  getReviewHunkFocus,
  publishReviewHunks,
  resetReviewHunkNavigation,
  reviewPaneScopeKey,
} from "@/lib/reviewHunkRegistry"
import { ReviewHunkScopeProvider } from "@/lib/reviewHunkScope"
import { cleanup, fireEvent, render } from "@/test/dom"

import { ReviewHunkAnnouncer } from "../components/views/ReviewHunkAnnouncer"
import { useReviewHunkKeys, type ReviewHunkKeyFile } from "./useReviewHunkKeys"

const SCOPE = "pane"
const DIR = "/repo"

const anchors = (count: number): ReviewHunkAnchor[] =>
  Array.from({ length: count }, (_, index) => ({ line: index + 1, side: "additions" as const }))

function Harness({
  scopeId = SCOPE,
  directory = DIR,
  scopeKey = reviewPaneScopeKey(directory, "git:all"),
  files,
}: {
  scopeId?: string
  directory?: string
  scopeKey?: string
  files?: readonly ReviewHunkKeyFile[]
}) {
  const paneRef = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState("src/a.ts")
  const acceptRef = useRef(true)
  const rail = files ?? [
    { path: "src/a.ts" },
    { path: "src/b.ts" },
    { path: "logo.png", hunkCount: 0 as const },
  ]
  useReviewHunkKeys({
    paneRef,
    files: rail,
    selectedFile: selected,
    onSelectFile: (path) => {
      if (!acceptRef.current) return
      setSelected(path)
    },
    scopeKey,
    scopeId,
    directory,
  })
  return (
    <ReviewHunkScopeProvider id={scopeId} directory={directory}>
      <I18nProvider>
        <div ref={paneRef} tabIndex={-1} data-review-changes data-review-pane={scopeId} data-selected={selected}>
          <ReviewHunkAnnouncer />
          <input aria-label="filter" />
          <textarea aria-label="comment" />
          <div contentEditable />
          <button
            type="button"
            data-ignore-select
            onClick={() => {
              acceptRef.current = false
            }}
          >
            ignore
          </button>
          <button
            type="button"
            data-select-other
            onClick={() => {
              setSelected("src/c.ts")
            }}
          >
            other
          </button>
        </div>
      </I18nProvider>
    </ReviewHunkScopeProvider>
  )
}

function pane(scopeId = SCOPE): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-review-pane="${scopeId}"]`)
  if (!element) throw new Error(`missing review pane ${scopeId}`)
  return element
}

function announcement(scopeId = SCOPE): string {
  return pane(scopeId).querySelector("[data-review-hunk-announcement]")?.textContent ?? ""
}

describe("review hunk keys", () => {
  beforeEach(() => {
    resetReviewHunkNavigation()
    publishReviewHunks(SCOPE, DIR, "src/a.ts", anchors(2))
    publishReviewHunks(SCOPE, DIR, "src/b.ts", anchors(1))
  })

  afterEach(() => {
    cleanup()
    resetReviewHunkNavigation()
  })

  test("F7 and Shift+F7 move across files and stop at the ends", () => {
    render(<Harness />)
    const review = pane()

    fireEvent.keyDown(review, { key: "F7" })
    expect(announcement()).toBe("Change 1 of 2 in src/a.ts")
    expect(getReviewHunkFocus(SCOPE)).toMatchObject({ path: "src/a.ts", hunkIndex: 0 })

    fireEvent.keyDown(review, { key: "F7" })
    expect(announcement()).toBe("Change 2 of 2 in src/a.ts")

    fireEvent.keyDown(review, { key: "F7" })
    expect(announcement()).toBe("Change 1 of 1 in src/b.ts")
    expect(review.getAttribute("data-selected")).toBe("src/b.ts")

    fireEvent.keyDown(review, { key: "F7" })
    expect(announcement()).toBe("Last change in this review")
    expect(getReviewHunkFocus(SCOPE)?.hunkIndex).toBe(0)

    fireEvent.keyDown(review, { key: "F7", shiftKey: true })
    expect(announcement()).toBe("Change 2 of 2 in src/a.ts")
    expect(review.getAttribute("data-selected")).toBe("src/a.ts")
  })

  test("Alt+Down and Alt+Up are aliases and the first change is announced", () => {
    render(<Harness />)
    const review = pane()
    fireEvent.keyDown(review, { key: "ArrowDown", code: "ArrowDown", altKey: true })
    expect(announcement()).toBe("Change 1 of 2 in src/a.ts")
    fireEvent.keyDown(review, { key: "ArrowUp", code: "ArrowUp", altKey: true })
    expect(announcement()).toBe("First change in this review")
    expect(getReviewHunkFocus(SCOPE)?.hunkIndex).toBe(0)
  })

  test("ignores editable fields, the comment editor, and events a control already handled", () => {
    render(<Harness />)
    const review = pane()
    fireEvent.keyDown(review, { key: "F7" })
    expect(announcement()).toBe("Change 1 of 2 in src/a.ts")

    const input = review.querySelector("input")
    const comment = review.querySelector("textarea")
    const editable = review.querySelector("[contenteditable]")
    if (!input || !comment || !editable) throw new Error("missing fields")
    fireEvent.keyDown(input, { key: "F7" })
    fireEvent.keyDown(comment, { key: "F7" })
    fireEvent.keyDown(editable, { key: "F7" })
    expect(announcement()).toBe("Change 1 of 2 in src/a.ts")
    expect(getReviewHunkFocus(SCOPE)?.hunkIndex).toBe(0)

    review.addEventListener("keydown", (event) => event.preventDefault(), true)
    fireEvent.keyDown(review, { key: "F7" })
    expect(getReviewHunkFocus(SCOPE)?.hunkIndex).toBe(0)
  })

  test("resolves a file that publishes after it is selected", () => {
    resetReviewHunkNavigation()
    publishReviewHunks(SCOPE, DIR, "src/a.ts", anchors(1))
    render(<Harness />)
    const review = pane()
    fireEvent.keyDown(review, { key: "F7" })
    fireEvent.keyDown(review, { key: "F7" })
    expect(review.getAttribute("data-selected")).toBe("src/b.ts")
    const waiting = getReviewHunkAnnouncement(SCOPE)
    expect(waiting?.kind).toBe("position")
    if (waiting?.kind === "position") expect(waiting.path).toBe("src/a.ts")

    act(() => {
      publishReviewHunks(SCOPE, DIR, "src/b.ts", [{ line: 9, side: "additions" }])
    })
    expect(announcement()).toBe("Change 1 of 1 in src/b.ts")
    expect(getReviewHunkFocus(SCOPE)).toMatchObject({ path: "src/b.ts", hunkIndex: 0 })
  })

  test("clears the announcement when the review scope changes", () => {
    const view = render(<Harness />)
    fireEvent.keyDown(pane(), { key: "F7" })
    expect(announcement()).toBe("Change 1 of 2 in src/a.ts")
    view.rerender(<Harness scopeKey={reviewPaneScopeKey(DIR, "git:staged")} />)
    expect(announcement()).toBe("")
    expect(getReviewHunkFocus(SCOPE)).toBeNull()
  })

  test("switching repository drops the cursor", () => {
    publishReviewHunks(SCOPE, "/repo-a", "src/a.ts", anchors(2))
    publishReviewHunks(SCOPE, "/repo-a", "src/b.ts", anchors(1))
    const view = render(<Harness directory="/repo-a" scopeKey={reviewPaneScopeKey("/repo-a", "git:all")} />)
    fireEvent.keyDown(pane(), { key: "F7" })
    expect(getReviewHunkFocus(SCOPE)?.directory).toBe("/repo-a")
    view.rerender(<Harness directory="/repo-b" scopeKey={reviewPaneScopeKey("/repo-b", "git:all")} />)
    expect(announcement()).toBe("")
    expect(getReviewHunkFocus(SCOPE)).toBeNull()
  })

  test("a second review pane does not walk when this pane's file has no hunks", () => {
    resetReviewHunkNavigation()
    const files = [{ path: "src/a.ts" }, { path: "src/b.ts" }, { path: "src/c.ts" }]
    for (const scopeId of ["idle", "active"]) {
      publishReviewHunks(scopeId, DIR, "src/a.ts", anchors(1))
      publishReviewHunks(scopeId, DIR, "src/c.ts", anchors(1))
    }
    render(
      <>
        <Harness scopeId="idle" files={files} />
        <Harness scopeId="active" files={files} />
      </>,
    )

    fireEvent.keyDown(pane("idle"), { key: "F7" })
    fireEvent.keyDown(pane("active"), { key: "F7" })
    fireEvent.keyDown(pane("active"), { key: "F7" })
    expect(pane("active").getAttribute("data-selected")).toBe("src/b.ts")

    act(() => {
      publishReviewHunks("active", DIR, "src/b.ts", [])
    })

    expect(pane("active").getAttribute("data-selected")).toBe("src/c.ts")
    expect(getReviewHunkFocus("active")).toMatchObject({ path: "src/c.ts", hunkIndex: 0 })
    expect(pane("idle").getAttribute("data-selected")).toBe("src/a.ts")
    expect(getReviewHunkFocus("idle")).toMatchObject({ path: "src/a.ts", hunkIndex: 0 })
  })

  test("a selection that did not change still clears focus on the next real file change", () => {
    render(<Harness />)
    const review = pane()
    fireEvent.keyDown(review, { key: "F7" })
    fireEvent.keyDown(review, { key: "F7" })
    expect(getReviewHunkFocus(SCOPE)).toMatchObject({ path: "src/a.ts", hunkIndex: 1 })

    fireEvent.click(review.querySelector("[data-ignore-select]") as HTMLButtonElement)
    fireEvent.keyDown(review, { key: "F7" })
    expect(review.getAttribute("data-selected")).toBe("src/a.ts")
    expect(getReviewHunkFocus(SCOPE)?.path).toBe("src/b.ts")

    fireEvent.click(review.querySelector("[data-select-other]") as HTMLButtonElement)
    expect(review.getAttribute("data-selected")).toBe("src/c.ts")
    expect(getReviewHunkFocus(SCOPE)).toBeNull()
  })

  test("announces the hunk header with the position", () => {
    publishReviewHunks(SCOPE, DIR, "src/a.ts", [
      { line: 4, side: "additions", header: "@@ -1,3 +1,4 @@" },
      { line: 9, side: "additions" },
    ])
    render(<Harness />)
    fireEvent.keyDown(pane(), { key: "F7" })
    expect(announcement()).toBe("Change 1 of 2 in src/a.ts: @@ -1,3 +1,4 @@")
  })

  test("macOS help text mentions Fn+F7", () => {
    expect(dict["helpDialog.item.nextChange"]).toContain("Fn+F7")
    expect(dict["helpDialog.item.previousChange"]).toContain("Fn+Shift+F7")
  })
})
