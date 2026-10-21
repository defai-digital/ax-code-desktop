import { afterEach, describe, expect, test } from "vitest"

import {
  applyReviewHunkHighlight,
  clearReviewHunkHighlight,
  maintainReviewHunkHighlight,
  syncReviewHunkHighlightFrame,
} from "./reviewHunkFocus"

function hostWithShadow(): { container: HTMLDivElement; shadow: ShadowRoot } {
  const container = document.createElement("div")
  const host = document.createElement("diffs-container")
  const shadow = host.attachShadow({ mode: "open" })
  container.append(host)
  document.body.append(container)
  return { container, shadow }
}

afterEach(() => {
  document.body.replaceChildren()
})

describe("review hunk highlight", () => {
  test("marks the matching column's line and the hunk separator, then scrolls the line", () => {
    const { container, shadow } = hostWithShadow()
    const additions = document.createElement("div")
    additions.setAttribute("data-additions", "")
    const deletions = document.createElement("div")
    deletions.setAttribute("data-deletions", "")
    const separator = document.createElement("div")
    separator.setAttribute("data-separator", "")
    separator.setAttribute("data-expand-index", "1")
    const additionLine = document.createElement("div")
    additionLine.setAttribute("data-line", "12")
    const deletionLine = document.createElement("div")
    deletionLine.setAttribute("data-line", "12")
    let scrolled = 0
    additionLine.scrollIntoView = () => {
      scrolled += 1
    }
    additions.append(separator, additionLine)
    deletions.append(deletionLine)
    shadow.append(additions, deletions)

    const found = applyReviewHunkHighlight(container, { line: 12, side: "additions" }, { hunkIndex: 1, scroll: true })

    expect(found).toBe(additionLine)
    expect(additionLine.getAttribute("data-review-hunk-focus")).toBe("line")
    expect(additionLine.getAttribute("aria-current")).toBe("true")
    expect(deletionLine.hasAttribute("data-review-hunk-focus")).toBe(false)
    expect(separator.getAttribute("data-review-hunk-focus")).toBe("header")
    expect(scrolled).toBe(1)

    clearReviewHunkHighlight(container)
    expect(additionLine.hasAttribute("aria-current")).toBe(false)
    expect(separator.hasAttribute("data-review-hunk-focus")).toBe(false)
  })

  test("walks to the preceding separator when the hunk index is not on it", () => {
    const { container, shadow } = hostWithShadow()
    const separator = document.createElement("div")
    separator.setAttribute("data-separator", "")
    const line = document.createElement("div")
    line.setAttribute("data-line", "3")
    shadow.append(separator, line)

    applyReviewHunkHighlight(container, { line: 3, side: "deletions" }, { hunkIndex: 0, scroll: false })

    expect(line.getAttribute("data-review-hunk-focus")).toBe("line")
    expect(separator.getAttribute("data-review-hunk-focus")).toBe("header")
  })

  test("scrolls the review scroller when the line is not mounted yet", () => {
    const scroller = document.createElement("div")
    scroller.className = "overlay-scrollbar-container"
    Object.defineProperty(scroller, "clientHeight", { value: 200 })
    document.body.append(scroller)
    const container = document.createElement("div")
    scroller.append(container)

    const found = applyReviewHunkHighlight(container, { line: 40, side: "additions" }, { hunkIndex: 2, scroll: true, lineTop: 500 })

    expect(found).toBeNull()
    expect(scroller.scrollTop).toBe(450)
  })

  test("a virtualized scroll frame keeps the focus mark that is already on the line", () => {
    const { container, shadow } = hostWithShadow()
    const line = document.createElement("div")
    line.setAttribute("data-line", "8")
    let scrolled = 0
    let cleared = 0
    line.scrollIntoView = () => {
      scrolled += 1
    }
    const removeAttribute = line.removeAttribute.bind(line)
    line.removeAttribute = (name: string) => {
      if (name === "data-review-hunk-focus") cleared += 1
      removeAttribute(name)
    }
    shadow.append(line)
    const anchor = { line: 8, side: "additions" as const }
    const pendingScroll = { current: true }
    syncReviewHunkHighlightFrame(container, { anchor, hunkIndex: 0 }, pendingScroll)
    expect(scrolled).toBe(1)
    expect(pendingScroll.current).toBe(false)

    shadow.append(document.createElement("div"))
    syncReviewHunkHighlightFrame(container, { anchor, hunkIndex: 0 }, pendingScroll)

    expect(scrolled).toBe(1)
    expect(cleared).toBe(0)
    expect(line.getAttribute("data-review-hunk-focus")).toBe("line")
    expect(maintainReviewHunkHighlight(container, anchor, { hunkIndex: 0, scroll: false, pendingScroll: false })).toBe(
      "kept",
    )
  })

  test("re-applies the mark after the focused line is replaced, and scrolls while a scroll is pending", () => {
    const { container, shadow } = hostWithShadow()
    const first = document.createElement("div")
    first.setAttribute("data-line", "8")
    shadow.append(first)
    const anchor = { line: 8, side: "additions" as const }
    applyReviewHunkHighlight(container, anchor, { hunkIndex: 0, scroll: false })
    first.remove()
    const replacement = document.createElement("div")
    replacement.setAttribute("data-line", "8")
    let scrolled = 0
    replacement.scrollIntoView = () => {
      scrolled += 1
    }
    shadow.append(replacement)

    expect(maintainReviewHunkHighlight(container, anchor, { hunkIndex: 0, scroll: false, pendingScroll: false })).toBe(
      "applied",
    )
    expect(replacement.getAttribute("data-review-hunk-focus")).toBe("line")
    expect(scrolled).toBe(0)

    const pending = maintainReviewHunkHighlight(container, anchor, { hunkIndex: 0, scroll: true, pendingScroll: true })
    expect(pending).toBe("applied")
    expect(scrolled).toBe(1)
  })
})
