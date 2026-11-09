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

test("focusing the panel preserves both views and returning respects unsaved Files", () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} })
  useUIStore.setState({ splitPaneEnabled: true, splitPaneRightTab: "files", splitPaneRatio: 0.5, isMobile: false })
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  const guard = vi.fn(() => false)
  useUIStore.getState().setMainTabGuard(guard)
  try {
    act(() => root.render(
      <SplitPaneLayout rightContent={<textarea data-editor defaultValue="Unsaved file" />}>
        <textarea data-draft defaultValue="Unsent message" />
      </SplitPaneLayout>,
    ))
    const editor = container.querySelector<HTMLTextAreaElement>("[data-editor]")!
    const draft = container.querySelector<HTMLTextAreaElement>("[data-draft]")!
    const click = (label: string) => act(() => container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.click())
    click("splitPane.focusPanel")
    expect(container.querySelector("[data-panel-focused=true]")).not.toBeNull()
    expect(container.querySelector("[data-editor]")).toBe(editor)
    expect(container.querySelector("[data-draft]")).toBe(draft)
    click("splitPane.restoreSplit")
    expect(container.querySelector("[data-panel-focused=true]")).toBeNull()
    click("splitPane.backToConversation")
    expect(guard).toHaveBeenCalledWith("chat")
    expect(useUIStore.getState().splitPaneEnabled).toBe(true)
    expect(editor.value).toBe("Unsaved file")
    expect(draft.value).toBe("Unsent message")
    useUIStore.getState().setMainTabGuard(null)
    click("splitPane.backToConversation")
    expect(useUIStore.getState().splitPaneEnabled).toBe(false)
    expect(container.querySelector("[data-draft]")).toBe(draft)
  } finally {
    useUIStore.getState().setMainTabGuard(null)
    act(() => root.unmount())
    container.remove()
  }
})

test("opening and closing an inspector does not remount the conversation", () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} })
  useUIStore.setState({ splitPaneEnabled: false, splitPaneRightTab: "files" })
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  try {
    act(() => root.render(<SplitPaneLayout rightContent={<p>Files</p>}><textarea defaultValue="Keep draft" /></SplitPaneLayout>))
    const draft = container.querySelector("textarea")!
    act(() => useUIStore.getState().setSplitPaneEnabled(true))
    expect(container.querySelector("textarea")).toBe(draft)
    act(() => useUIStore.getState().setSplitPaneEnabled(false))
    expect(container.querySelector("textarea")).toBe(draft)
    expect(draft.value).toBe("Keep draft")
  } finally {
    act(() => root.unmount())
    container.remove()
  }
})
