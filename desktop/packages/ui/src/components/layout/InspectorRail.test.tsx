import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock("@/hooks/useSupervisionRows", () => ({ useSupervisionRow: () => ({ evidence: { files: 120 } }) }))
const sessionWindow = vi.hoisted(() => ({
  available: false,
  open: vi.fn<(target: { sessionId: string; directory: string | null }, failureMessage: string) => Promise<boolean>>(async () => true),
}))
vi.mock("@/lib/supervision/openSessionWindow", () => ({
  canOpenSessionWindow: () => sessionWindow.available,
  openSessionWindow: (target: { sessionId: string; directory: string | null }, failureMessage: string) =>
    sessionWindow.open(target, failureMessage),
}))
import { useUIStore } from "@/stores/useUIStore"
import { useDirectoryStore } from "@/stores/useDirectoryStore"
import { useSupervisionStore } from "@/stores/useSupervisionStore"
import { useSessionUIStore } from "@/sync/session-ui-store"
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
    useSupervisionStore.setState({ inspectorLabels: false, inspectorCollapsed: false })
    sessionWindow.available = false
    sessionWindow.open.mockClear()
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
    expect(container.querySelectorAll("button[aria-pressed]")).toHaveLength(7)
    expect(container.querySelector('button[aria-label="wiki.graph.title"]')).toBeNull()
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
  test("collapses fully and reopens without closing the conversation beside it", () => {
    act(() => useUIStore.setState({ splitPaneEnabled: true, splitPaneRightTab: "plan" }))
    const collapse = action("supervision.inspector.tools")
    expect(collapse.getAttribute("aria-pressed")).toBeNull()
    act(() => collapse.click())
    expect(useSupervisionStore.getState().inspectorCollapsed).toBe(true)
    expect(useUIStore.getState().splitPaneEnabled).toBe(true)
    expect(useUIStore.getState().splitPaneRightTab).toBe("plan")
    expect(container.querySelector("[data-inspector-collapsed]")?.getAttribute("data-inspector-collapsed")).toBe("true")
    expect(container.querySelectorAll("button[aria-pressed]")).toHaveLength(0)
    const reopen = action("supervision.inspector.tools")
    expect(reopen.getAttribute("aria-expanded")).toBe("false")
    act(() => reopen.click())
    expect(container.querySelectorAll("button[aria-pressed]")).toHaveLength(7)
    expect(useUIStore.getState().splitPaneRightTab).toBe("plan")
  })
  test("opens the current session in its own window from the tools rail", () => {
    sessionWindow.available = true
    act(() => {
      useDirectoryStore.setState({ currentDirectory: "/repo/project" })
      useSessionUIStore.setState({ currentSessionId: "ses_1" })
      root.render(<InspectorRail />)
    })
    const button = container.querySelector<HTMLButtonElement>("[data-open-session-window]")
    expect(button?.getAttribute("aria-pressed")).toBeNull()
    expect(container.querySelectorAll("button[aria-pressed]")).toHaveLength(7)
    act(() => button?.click())
    expect(sessionWindow.open).toHaveBeenCalledWith(
      { sessionId: "ses_1", directory: "/repo/project" },
      "supervision.navigation.openInWindowFailed",
    )
  })
})
