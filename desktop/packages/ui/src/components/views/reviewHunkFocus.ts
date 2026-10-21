import type { ReviewHunkAnchor } from "@/lib/reviewHunkNavigation"

const FOCUS_ATTR = "data-review-hunk-focus"

export type ReviewHunkHighlightOptions = {
  /** Hunk index used to mark the rendered separator that introduces the hunk. */
  hunkIndex: number
  scroll?: boolean
  /** Virtualized line offset. Used when the line is not in the DOM yet. */
  lineTop?: number
}

function columnOf(element: Element): "additions" | "deletions" | "unified" | null {
  if (element.closest("[data-additions]")) return "additions"
  if (element.closest("[data-deletions]")) return "deletions"
  if (element.closest("[data-unified]")) return "unified"
  return null
}

function shadowRoots(container: ParentNode): ParentNode[] {
  const roots: ParentNode[] = []
  const hosts = container.querySelectorAll("diffs-container")
  for (const host of hosts) {
    if (host.shadowRoot) roots.push(host.shadowRoot)
  }
  return roots
}

function searchRoots(container: ParentNode): ParentNode[] {
  return [...shadowRoots(container), container]
}

function clearIn(root: ParentNode): void {
  for (const marked of root.querySelectorAll(`[${FOCUS_ATTR}]`)) {
    marked.removeAttribute(FOCUS_ATTR)
    marked.removeAttribute("aria-current")
  }
}

export function clearReviewHunkHighlight(container: ParentNode): void {
  clearIn(container)
  for (const root of shadowRoots(container)) clearIn(root)
}

function numericAttribute(value: number): string | null {
  if (!Number.isInteger(value) || value < 0) return null
  return String(value)
}

function findLine(root: ParentNode, anchor: ReviewHunkAnchor): HTMLElement | null {
  const line = numericAttribute(anchor.line)
  if (!line) return null
  const selector = `[data-line="${line}"]`
  const matches = [...root.querySelectorAll<HTMLElement>(selector)]
  const preferred = matches.find((element) => {
    const column = columnOf(element)
    return column === anchor.side || column === "unified"
  })
  if (preferred) return preferred
  if (matches[0]) return matches[0]

  const gutter = [...root.querySelectorAll<HTMLElement>(`[data-column-number="${line}"]`)]
  const gutterMatch =
    gutter.find((element) => {
      const column = columnOf(element)
      return column === anchor.side || column === "unified"
    }) ?? gutter[0]
  if (!gutterMatch) return null
  const lineIndex = gutterMatch.getAttribute("data-line-index")
  if (!lineIndex) return gutterMatch
  const content = /^[0-9]+$/.test(lineIndex)
    ? root.querySelector<HTMLElement>(`[data-line][data-line-index="${lineIndex}"]`)
    : null
  return content ?? gutterMatch
}

function markHeader(root: ParentNode, line: HTMLElement, hunkIndex: number): void {
  const index = numericAttribute(hunkIndex)
  const separators = index
    ? root.querySelectorAll<HTMLElement>(`[data-separator][data-expand-index="${index}"]`)
    : []
  let marked = false
  for (const separator of separators) {
    if (separator.hasAttribute("data-separator-last")) continue
    separator.setAttribute(FOCUS_ATTR, "header")
    marked = true
  }
  if (marked) return

  let cursor: Element | null = line
  for (;;) {
    let previous = cursor.previousElementSibling
    while (previous) {
      const separator = previous.matches("[data-separator]")
        ? previous
        : previous.querySelector("[data-separator]")
      if (separator) {
        separator.setAttribute(FOCUS_ATTR, "header")
        return
      }
      if (previous.matches("[data-line]") || previous.querySelector("[data-line]")) return
      previous = previous.previousElementSibling
    }
    const parent: Element | null = cursor.parentElement
    if (
      !parent ||
      parent.hasAttribute("data-unified") ||
      parent.hasAttribute("data-additions") ||
      parent.hasAttribute("data-deletions")
    ) {
      return
    }
    cursor = parent
  }
}

function scrollParent(container: ParentNode): HTMLElement | null {
  if (!(container instanceof HTMLElement)) return null
  const scroller = container.closest(".overlay-scrollbar-container, [data-diff-virtual-content]")
  return scroller instanceof HTMLElement ? scroller : null
}

/** True when the anchor's line element is already the focused row. */
export function reviewHunkLineIsMarked(container: ParentNode, anchor: ReviewHunkAnchor): boolean {
  for (const root of searchRoots(container)) {
    const line = findLine(root, anchor)
    if (line?.getAttribute(FOCUS_ATTR) === "line") return true
  }
  return false
}

/**
 * Marks the rendered hunk and scrolls it into view. Pierre draws into an open shadow
 * root and virtualizes off-screen lines, so a miss leaves the scroll offset for a retry.
 * Returns the line element when it was in the DOM.
 */
export function applyReviewHunkHighlight(
  container: ParentNode,
  anchor: ReviewHunkAnchor,
  options: ReviewHunkHighlightOptions,
): HTMLElement | null {
  clearReviewHunkHighlight(container)
  for (const root of searchRoots(container)) {
    const line = findLine(root, anchor)
    if (!line) continue
    line.setAttribute(FOCUS_ATTR, "line")
    line.setAttribute("aria-current", "true")
    markHeader(root, line, options.hunkIndex)
    if (options.scroll && typeof line.scrollIntoView === "function") {
      line.scrollIntoView({ block: "center", inline: "nearest" })
    }
    return line
  }

  if (options.scroll && typeof options.lineTop === "number") {
    const scroller = scrollParent(container)
    if (scroller) {
      const offset = scroller.clientHeight > 0 ? scroller.clientHeight * 0.25 : 0
      scroller.scrollTop = Math.max(0, options.lineTop - offset)
    }
  }
  return null
}

/**
 * Virtualized scroll mutates the shadow tree on every frame. Leave a line that already
 * carries the focus mark alone. Re-apply after a pending scroll, or when that line was
 * actually replaced and no longer carries the mark.
 */
export function maintainReviewHunkHighlight(
  container: ParentNode,
  anchor: ReviewHunkAnchor,
  options: ReviewHunkHighlightOptions & { pendingScroll?: boolean },
): "kept" | "applied" | "missing" {
  if (!options.pendingScroll && reviewHunkLineIsMarked(container, anchor)) return "kept"
  const line = applyReviewHunkHighlight(container, anchor, options)
  return line ? "applied" : "missing"
}

/** Body of the diff viewer's mutation frame. Skips a no-op highlight refresh. */
export function syncReviewHunkHighlightFrame(
  container: ParentNode,
  focus: { anchor: ReviewHunkAnchor; hunkIndex: number } | null,
  pendingScroll: { current: boolean },
): void {
  if (!focus) {
    pendingScroll.current = false
    clearReviewHunkHighlight(container)
    return
  }
  const outcome = maintainReviewHunkHighlight(container, focus.anchor, {
    hunkIndex: focus.hunkIndex,
    scroll: pendingScroll.current,
    pendingScroll: pendingScroll.current,
  })
  if (outcome === "applied") pendingScroll.current = false
}
