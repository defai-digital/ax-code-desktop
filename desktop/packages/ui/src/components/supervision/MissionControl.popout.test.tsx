import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const desktop = vi.hoisted(() => ({
  invokeDesktop: vi.fn(async (command: string) => (command === "desktop_focus_main_window" ? { focused: true } : null)),
  canUseLocalElectronDesktopIPC: vi.fn(() => true),
}))

vi.mock("@/lib/desktop", () => desktop)
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock("@/hooks/useSupervisionRows", () => ({ useSupervisionRows: () => useSupervisionStore((s) => s.rows) }))
vi.mock("@/sync/sync-context", () => ({ useAllPendingRequests: () => [] }))
vi.mock("@/sync/session-actions", () => ({
  respondToPermission: vi.fn(),
  respondToQuestion: vi.fn(),
  rejectQuestion: vi.fn(),
}))
vi.mock("@/lib/supervision/openSession", () => ({ openSupervisedSession: vi.fn() }))
vi.mock("@/lib/supervision/openBesideChat", () => ({ openBesideChat: vi.fn() }))
vi.mock("@/components/ui", () => ({ toast: { error: vi.fn() } }))

import { openBesideChat } from "@/lib/supervision/openBesideChat"
import { openSupervisedSession } from "@/lib/supervision/openSession"
import { useSupervisionStore } from "@/stores/useSupervisionStore"
import { MissionControl } from "./MissionControl"

const flush = () => act(async () => {})

describe("Mission Control pop-out variant", () => {
  let container: HTMLDivElement
  let root: Root

  const render = (element: React.ReactElement) => act(() => root.render(element))
  const click = (element: Element | null) => {
    expect(element).not.toBeNull()
    act(() => element!.dispatchEvent(new MouseEvent("click", { bubbles: true })))
  }
  const buttonByLabel = (label: string) => container.querySelector(`button[aria-label="${label}"]`)
  const buttonByText = (text: string) =>
    Array.from(container.querySelectorAll("button")).find((button) => button.textContent === text) ?? null

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    Element.prototype.scrollIntoView = vi.fn()
    desktop.invokeDesktop.mockClear()
    desktop.canUseLocalElectronDesktopIPC.mockReturnValue(true)
    vi.mocked(openSupervisedSession).mockClear()
    vi.mocked(openBesideChat).mockClear()
    useSupervisionStore.setState({
      missionControlOpen: true,
      density: "comfortable",
      workingSets: [],
      activeWorkingSetId: null,
      boardFocusSessionId: null,
      compareRunGroupKey: null,
      rows: [
        {
          sessionId: "s1",
          title: "Task one",
          state: "running",
          treeSessionIds: ["s1"],
          projectId: "p",
          projectLabel: "Project",
          directory: "/repo",
          updatedAt: Date.now(),
          evidence: { additions: 3, deletions: 1, files: 2 },
          goal: null,
        },
      ],
    })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test("marks the board root with its variant", () => {
    render(<MissionControl variant="popout" />)
    expect(container.querySelector('[data-mission-control="popout"]')).not.toBeNull()
  })

  test("opens a session through the main-window hand-off instead of the in-window navigation", async () => {
    render(<MissionControl variant="popout" />)
    click(buttonByLabel("supervision.missionControl.action.open — Task one"))
    await flush()
    expect(desktop.invokeDesktop).toHaveBeenCalledWith("desktop_focus_main_window", {
      sessionId: "s1",
      directory: "/repo",
    })
    expect(openSupervisedSession).not.toHaveBeenCalled()
    expect(useSupervisionStore.getState().missionControlOpen).toBe(true)
  })

  test("hides close, dispatch, pop-out and beside-chat controls", () => {
    render(<MissionControl variant="popout" />)
    expect(buttonByLabel("supervision.missionControl.closeAria")).toBeNull()
    expect(buttonByLabel("supervision.missionControl.popOut")).toBeNull()
    expect(buttonByText("supervision.dispatch.title")).toBeNull()
    // Space opens the peek; its "review changes" opens the diff beside the chat, which the pop-out lacks.
    const board = container.querySelector('[role="grid"]')!
    act(() => board.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true })))
    expect(buttonByText("supervision.missionControl.action.openSession")).not.toBeNull()
    expect(buttonByText("supervision.missionControl.action.reviewChanges")).toBeNull()
  })

  test("Escape does not touch the main window's board state", () => {
    render(<MissionControl variant="popout" />)
    const board = container.querySelector('[role="grid"]')!
    act(() => board.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })))
    expect(useSupervisionStore.getState().missionControlOpen).toBe(true)
  })

  test("the embedded board keeps its controls and offers the pop-out in the Electron shell", async () => {
    render(<MissionControl />)
    expect(container.querySelector('[data-mission-control="embedded"]')).not.toBeNull()
    expect(buttonByLabel("supervision.missionControl.closeAria")).not.toBeNull()
    expect(buttonByText("supervision.dispatch.title")).not.toBeNull()
    const board = container.querySelector('[role="grid"]')!
    act(() => board.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true })))
    expect(buttonByText("supervision.missionControl.action.reviewChanges")).not.toBeNull()
    click(buttonByLabel("supervision.missionControl.popOut"))
    await flush()
    expect(desktop.invokeDesktop).toHaveBeenCalledWith("desktop_open_supervision_window")
  })

  test("the embedded board opens sessions in place", () => {
    render(<MissionControl />)
    click(buttonByLabel("supervision.missionControl.action.open — Task one"))
    expect(openSupervisedSession).toHaveBeenCalledWith({ sessionId: "s1", projectId: "p", directory: "/repo" })
    expect(desktop.invokeDesktop).not.toHaveBeenCalled()
  })

  test("the embedded board offers no pop-out outside the Electron shell", () => {
    desktop.canUseLocalElectronDesktopIPC.mockReturnValue(false)
    render(<MissionControl />)
    expect(buttonByLabel("supervision.missionControl.popOut")).toBeNull()
  })
})
