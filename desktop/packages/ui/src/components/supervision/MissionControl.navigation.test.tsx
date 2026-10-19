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

  const renameInput = () =>
    container.querySelector<HTMLInputElement>('input[aria-label="supervision.missionControl.renameWorkingSet"]')
  const startRename = () =>
    act(() =>
      container.querySelector<HTMLElement>('[aria-label="supervision.missionControl.renameWorkingSet"]')!.click(),
    )
  const buttonByText = (text: string) =>
    Array.from(container.querySelectorAll("button")).find((button) => button.textContent === text)
  const setWorkingSets = () =>
    act(() =>
      useSupervisionStore.setState({
        workingSets: [
          { id: "set-a", name: "Alpha", sessionIds: ["a"] },
          { id: "set-b", name: "Beta", sessionIds: ["b"] },
        ],
        activeWorkingSetId: "set-a",
      }),
    )

  test("switching working sets cancels an open rename", () => {
    setWorkingSets()
    startRename()
    expect(renameInput()?.value).toBe("Alpha")
    const beta = buttonByText("Beta")
    if (!beta) throw new Error("Beta working set not rendered")
    act(() => beta.click())
    expect(useSupervisionStore.getState().activeWorkingSetId).toBe("set-b")
    expect(renameInput()).toBeNull()
  })

  test("switching mode and back to a working set cancels an open rename", () => {
    setWorkingSets()
    startRename()
    const live = buttonByText("supervision.missionControl.filter.live")
    if (!live) throw new Error("Live filter not rendered")
    act(() => live.click())
    expect(useSupervisionStore.getState().activeWorkingSetId).toBeNull()
    const alpha = buttonByText("Alpha")
    if (!alpha) throw new Error("Alpha working set not rendered")
    act(() => alpha.click())
    expect(renameInput()).toBeNull()
  })

  test("creating a working set cancels an open rename", () => {
    setWorkingSets()
    startRename()
    act(() =>
      container.querySelector<HTMLElement>('[aria-label="supervision.missionControl.newWorkingSet"]')!.click(),
    )
    const nameInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="supervision.missionControl.workingSetNamePlaceholder"]',
    )!
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(nameInput, "Gamma")
      nameInput.dispatchEvent(new Event("input", { bubbles: true }))
    })
    const create = buttonByText("supervision.missionControl.createWorkingSet")
    if (!create) throw new Error("Create working set button not rendered")
    act(() => create.click())
    expect(useSupervisionStore.getState().activeWorkingSetId).not.toBe("set-a")
    expect(renameInput()).toBeNull()
  })
})
