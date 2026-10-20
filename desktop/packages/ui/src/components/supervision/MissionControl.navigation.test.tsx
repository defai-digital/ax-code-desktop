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
import { openSupervisedSession } from "@/lib/supervision/openSession"

describe("board keyboard and density interaction", () => {
  let container: HTMLDivElement
  let root: Root
  beforeEach(() => {
    vi.mocked(openSupervisedSession).mockClear()
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
        goal: null,
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
  const search = (value: string) => {
    const input = container.querySelector<HTMLInputElement>('input[type="search"]')!
    act(() => {
      input.focus()
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value)
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
    return input
  }
  test("search preserves input focus, isolates shortcuts and cannot activate a hidden row", () => {
    const board = container.querySelector('[role="grid"]')!
    key(board, "/")
    expect(document.activeElement).toBe(container.querySelector('input[type="search"]'))
    const input = search("Task b")
    expect(container.querySelectorAll('[role="row"]')).toHaveLength(1)
    expect(board.getAttribute("aria-activedescendant")).toBe("mission-row-b")
    key(input, "j")
    key(input, "Enter")
    expect(openSupervisedSession).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(input)
    search("no matching sessions")
    key(board, "Enter")
    expect(openSupervisedSession).not.toHaveBeenCalled()
    expect(board.hasAttribute("aria-activedescendant")).toBe(false)
    expect(container.textContent).toContain("supervision.missionControl.empty.filtered")
    key(input, "Escape")
    expect(input.value).toBe("")
    expect(document.activeElement).toBe(input)
    key(input, "Escape")
    expect(document.activeElement).toBe(board)
    expect(useSupervisionStore.getState().missionControlOpen).toBe(true)
  })
  test("hidden attention can clear every filter and return from a working set to Live", () => {
    act(() =>
      useSupervisionStore.setState({
        rows: useSupervisionStore
          .getState()
          .rows.map((row) => (row.sessionId === "b" ? { ...row, state: "goal" } : row)),
        workingSets: [{ id: "set-a", name: "Alpha", sessionIds: ["a"] }],
        activeWorkingSetId: "set-a",
      }),
    )
    search("Task a")
    const showHidden = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "supervision.missionControl.hiddenNeedsYou",
    )!
    act(() => showHidden.click())
    expect(useSupervisionStore.getState().activeWorkingSetId).toBeNull()
    expect(container.querySelectorAll('[role="row"]')).toHaveLength(2)
    expect(container.querySelector<HTMLInputElement>('input[type="search"]')?.value).toBe("")
  })
  test("filtering out expanded details removes its Escape step", () => {
    act(() => container.querySelector<HTMLButtonElement>('button[aria-expanded="false"]')!.click())
    search("Task b")
    const board = container.querySelector('[role="grid"]')!
    key(board, "Escape")
    expect(useSupervisionStore.getState().missionControlOpen).toBe(false)
  })
  test("path typing and composition stay native; shifted slash can focus search", () => {
    const board = container.querySelector('[role="grid"]')!
    const shortcut = new KeyboardEvent("keydown", { key: "/", shiftKey: true, bubbles: true, cancelable: true })
    act(() => board.dispatchEvent(shortcut))
    expect(shortcut.defaultPrevented).toBe(true)
    const input = search("/repo")
    for (const value of ["/", "j", "k", " "]) {
      const event = new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true })
      act(() => input.dispatchEvent(event))
      expect(event.defaultPrevented).toBe(false)
    }
    const composition = new KeyboardEvent("keydown", {
      key: "Escape",
      isComposing: true,
      bubbles: true,
      cancelable: true,
    })
    act(() => input.dispatchEvent(composition))
    expect(composition.defaultPrevented).toBe(false)
    expect(input.value).toBe("/repo")
  })
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

  test("details opens by button and Escape restores focus from its content", () => {
    const button = container.querySelector<HTMLButtonElement>('button[aria-expanded="false"]')!
    act(() => button.click())
    expect(button.getAttribute("aria-expanded")).toBe("true")
    const details = document.getElementById(button.getAttribute("aria-controls")!)!
    const action = details.querySelector<HTMLButtonElement>("button")!
    act(() => action.focus())
    key(action, "Escape")
    expect(container.querySelector(".mission-control-peek")).toBeNull()
    expect(document.activeElement).toBe(container.querySelector('[role="grid"]'))
    expect(useSupervisionStore.getState().missionControlOpen).toBe(true)
  })
  test("modified keys and arrows on action buttons do not move selection", () => {
    const board = container.querySelector('[role="grid"]')!
    const original = board.getAttribute("aria-activedescendant")
    const event = new KeyboardEvent("keydown", { key: "j", ctrlKey: true, bubbles: true, cancelable: true })
    act(() => board.dispatchEvent(event))
    expect(event.defaultPrevented).toBe(false)
    key(container.querySelector("button")!, "ArrowDown")
    expect(board.getAttribute("aria-activedescendant")).toBe(original)
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
    act(() => container.querySelector<HTMLElement>('[aria-label="supervision.missionControl.newWorkingSet"]')!.click())
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
