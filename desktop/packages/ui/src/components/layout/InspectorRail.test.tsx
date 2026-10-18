import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock("@/hooks/useSupervisionRows", () => ({ useSupervisionRow: () => ({ evidence: { files: 120 } }) }))
import { useUIStore } from "@/stores/useUIStore"
import { useSupervisionStore } from "@/stores/useSupervisionStore"
import { InspectorRail } from "./InspectorRail"

describe("inspector labeled navigation", () => {
  let container: HTMLDivElement
  let root: Root
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    useUIStore.setState({
      isMobile: false,
      splitPaneEnabled: false,
      splitPaneRightTab: "files",
      isBottomTerminalOpen: false,
      mainTabGuard: null,
    })
    useSupervisionStore.setState({ inspectorLabels: false })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => root.render(<InspectorRail />))
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })
  const action = (name: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!
  test("expands labels without replacing controls, keeps focus, and preserves badge and terminal dock", () => {
    const toggle = action("supervision.inspector.tools: supervision.inspector.showLabels")
    const diff = action("supervision.inspector.changes")
    toggle.focus()
    act(() => toggle.click())
    expect(document.activeElement).toBe(toggle)
    expect(toggle.getAttribute("aria-expanded")).toBe("true")
    expect(action("supervision.inspector.changes")).toBe(diff)
    expect(diff.textContent).toContain("supervision.inspector.changes")
    expect(diff.textContent).toContain("99+")
    expect(container.querySelectorAll("button[aria-pressed]")).toHaveLength(8)
    act(() => action("splitPane.tab.terminal").click())
    expect(useUIStore.getState().isBottomTerminalOpen).toBe(true)
    expect(useUIStore.getState().splitPaneRightTab).toBe("files")
    act(() => action("splitPane.tab.terminal").click())
    expect(useUIStore.getState().isBottomTerminalOpen).toBe(false)
  })
  test("Escape collapses labels and returns focus to the toggle", () => {
    const toggle = action("supervision.inspector.tools: supervision.inspector.showLabels")
    act(() => toggle.click())
    const diff = action("supervision.inspector.changes")
    diff.focus()
    act(() => diff.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })))
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    expect(document.activeElement).toBe(toggle)
  })
  test("views toggle beside chat and respect an unsaved editor guard", () => {
    act(() => action("supervision.inspector.changes").click())
    expect(useUIStore.getState().splitPaneRightTab).toBe("diff")
    expect(action("supervision.inspector.changes").getAttribute("aria-pressed")).toBe("true")
    act(() => action("supervision.inspector.changes").click())
    expect(useUIStore.getState().splitPaneEnabled).toBe(false)
    act(() => useUIStore.setState({ splitPaneEnabled: true, splitPaneRightTab: "files", mainTabGuard: () => false }))
    act(() => action("supervision.inspector.changes").click())
    expect(useUIStore.getState().splitPaneRightTab).toBe("files")
  })
  test("does not expose the desktop rail on mobile", () => {
    act(() => useUIStore.setState({ isMobile: true }))
    expect(container.querySelector("nav")).toBeNull()
  })
})
