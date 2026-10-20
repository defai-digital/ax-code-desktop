import React, { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, test, vi } from "vitest"
import { useUIStore } from "@/stores/useUIStore"
import { SplitPaneLayout } from "./SplitPaneLayout"

vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test("a focused chat draft survives review resizing and focus moves to a visible review tab", () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  let resize = () => {}
  let narrow = false
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize = callback
      }
      observe() {}
      disconnect() {}
    },
  )
  vi.spyOn(window, "getComputedStyle").mockImplementation(
    () => ({ display: narrow ? "none" : "flex" }) as CSSStyleDeclaration,
  )
  useUIStore.setState({ splitPaneEnabled: true, splitPaneRightTab: "diff", splitPaneRatio: 0.5 })
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  try {
    act(() =>
      root.render(
        <SplitPaneLayout rightContent={<p>Review</p>}>
          <textarea defaultValue="Keep this draft" />
        </SplitPaneLayout>,
      ),
    )
    const draft = container.querySelector("textarea")!
    act(() => draft.focus())
    narrow = true
    act(() => resize())
    expect(document.activeElement).toBe(container.querySelector('[data-split-inspector] [aria-pressed="true"]'))
    expect(container.querySelector("textarea")).toBe(draft)
    expect(draft.value).toBe("Keep this draft")
    narrow = false
    act(() => resize())
    expect(container.querySelector("textarea")).toBe(draft)
    expect(useUIStore.getState().splitPaneRatio).toBe(0.5)
  } finally {
    act(() => root.unmount())
    container.remove()
  }
})
