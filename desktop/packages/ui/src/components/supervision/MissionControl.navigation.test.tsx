import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock("@/hooks/useSupervisionRows", () => ({ useSupervisionRows: () => useSupervisionStore((s) => s.rows) }))
vi.mock("@/sync/sync-context", () => ({ useAllPendingRequests: () => [] }))
vi.mock("@/sync/session-actions", () => ({
  respondToPermission: vi.fn(),
  respondToQuestion: vi.fn(),
  rejectQuestion: vi.fn(),
}))
vi.mock("@/lib/supervision/openSession", () => ({ openSupervisedSession: vi.fn() }))
vi.mock("@/components/ui", () => ({ toast: { error: vi.fn() } }))
import { useSupervisionStore } from "@/stores/useSupervisionStore"
import { MissionControl } from "./MissionControl"

describe("board keyboard and density interaction", () => {
  let container: HTMLDivElement
  let root: Root
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    Element.prototype.scrollIntoView = vi.fn()
    useSupervisionStore.setState({
      missionControlOpen: true,
      density: "comfortable",
      workingSets: [],
      activeWorkingSetId: null,
      boardFocusSessionId: null,
      rows: ["a", "b"].map((sessionId) => ({
        sessionId,
        title: `Task ${sessionId}`,
        state: "running",
        treeSessionIds: [sessionId],
        projectId: "p",
        projectLabel: "Project",
        directory: "/repo",
        updatedAt: Date.now(),
        evidence: null,
      })),
    })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => root.render(<MissionControl />))
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })
  const key = (element: Element, key: string) =>
    act(() => element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })))
  test("changing density preserves the selected row DOM node and keyboard navigation", () => {
    const board = container.querySelector('[role="grid"]')!
    key(board, "ArrowDown")
    expect(board.getAttribute("aria-activedescendant")).toBe("mission-row-b")
    const selected = container.querySelector("#mission-row-b")
    const select = container.querySelector("select")!
    act(() => {
      select.value = "compact"
      select.dispatchEvent(new Event("change", { bubbles: true }))
    })
    expect(useSupervisionStore.getState().density).toBe("compact")
    expect(container.querySelector("#mission-row-b")).toBe(selected)
    expect(board.getAttribute("aria-activedescendant")).toBe("mission-row-b")
    key(board, "k")
    expect(board.getAttribute("aria-activedescendant")).toBe("mission-row-a")
  })
  test("density controls keep native keys without moving board selection", () => {
    const board = container.querySelector('[role="grid"]')!
    const selected = board.getAttribute("aria-activedescendant")
    for (const value of [" ", "Enter", "j", "k", "ArrowDown", "ArrowUp"]) {
      const event = new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true })
      act(() => container.querySelector("select")!.dispatchEvent(event))
      expect(event.defaultPrevented).toBe(false)
      expect(board.getAttribute("aria-activedescendant")).toBe(selected)
    }
  })
  test("Escape in density selection does not close the board, while Escape on the board does", () => {
    key(container.querySelector("select")!, "Escape")
    expect(useSupervisionStore.getState().missionControlOpen).toBe(true)
    key(container.querySelector('[role="grid"]')!, "Escape")
    expect(useSupervisionStore.getState().missionControlOpen).toBe(false)
  })
})
