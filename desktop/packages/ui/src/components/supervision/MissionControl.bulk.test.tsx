import React, { act } from "react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@/test/dom"
import type { SupervisionRow } from "@/lib/supervision/rows"

vi.mock("@/lib/i18n", async () => {
  const { dict } = await import("@/lib/i18n/messages/en")
  return {
    useI18n: () => ({
      t: (key: keyof typeof dict, params: Record<string, string | number> = {}) =>
        (dict[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? name)),
      number: (value: number) => String(value),
    }),
  }
})
vi.mock("@/hooks/useSupervisionRows", () => ({ useSupervisionRows: () => useSupervisionStore((s) => s.rows) }))
vi.mock("@/sync/sync-context", () => ({ useAllPendingRequests: () => [] }))
vi.mock("@/sync/session-actions", () => ({
  abortCurrentOperation: vi.fn(),
  archiveSession: vi.fn(),
  respondToPermission: vi.fn(),
  respondToQuestion: vi.fn(),
  rejectQuestion: vi.fn(),
}))
vi.mock("@/lib/supervision/openSession", () => ({ openSupervisedSession: vi.fn() }))
vi.mock("@/lib/supervision/openBesideChat", () => ({ openBesideChat: vi.fn() }))
vi.mock("@/components/ui", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { toast } from "@/components/ui"
import { openSupervisedSession } from "@/lib/supervision/openSession"
import { useSupervisionStore } from "@/stores/useSupervisionStore"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { abortCurrentOperation, archiveSession, respondToPermission } from "@/sync/session-actions"
import { MissionControl } from "./MissionControl"

const row = (sessionId: string, project: string, state: SupervisionRow["state"]): SupervisionRow => ({
  sessionId,
  title: `Task ${sessionId}`,
  state,
  treeSessionIds: [sessionId],
  projectId: project,
  projectLabel: project,
  directory: `/repo/${project}`,
  updatedAt: Date.now(),
  evidence: null,
  goal: null,
})
const board = () => screen.getByRole("grid")
const toolbar = () => within(screen.getByRole("toolbar", { name: "Selected sessions" }))
const key = (key: string, shiftKey = false) => fireEvent.keyDown(board(), { key, shiftKey })
const selectAll = () => key("X", true)
const checkbox = (name: string) => screen.getByRole("checkbox", { name }) as HTMLInputElement
const chooseSet = (value: string) =>
  act(() => {
    const select = toolbar().getByRole("combobox", { name: "Add to working set" }) as HTMLSelectElement
    select.value = value
    select.dispatchEvent(new Event("change", { bubbles: true }))
  })
const answer = async (name: "Confirm" | "Cancel") => {
  await act(async () => fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name })))
}

beforeEach(() => {
  vi.resetAllMocks()
  Element.prototype.scrollIntoView = vi.fn()
  useSupervisionStore.setState({
    rows: [row("a1", "Alpha", "running"), row("a2", "Alpha", "permission"), row("b1", "Beta", "running")],
    density: "comfortable",
    boardGroupBy: "project",
    boardFocusSessionId: null,
    workingSets: [{ id: "set-a", name: "Review", sessionIds: ["a2"] }],
    activeWorkingSetId: null,
    missionControlOpen: true,
  })
  useSessionUIStore.setState({ sessionAbortFlags: new Map() })
  vi.mocked(abortCurrentOperation).mockResolvedValue(true)
  vi.mocked(archiveSession).mockResolvedValue(true)
})
afterEach(cleanup)

describe("Mission Control bulk selection", () => {
  test("x toggles the focused row and Shift+x selects all visible rows without opening sessions", () => {
    render(<MissionControl />)
    expect(screen.queryByRole("toolbar")).toBeNull()
    key("x")
    expect(checkbox("Select Alpha · Task a1").checked).toBe(true)
    expect(document.getElementById("mission-row-a1")?.getAttribute("aria-selected")).toBe("true")
    expect(toolbar().getByText("1 selected")).toBeTruthy()
    key("x")
    expect(screen.queryByRole("toolbar")).toBeNull()
    key("j")
    key("x")
    expect(checkbox("Select Alpha · Task a2").checked).toBe(true)
    expect(checkbox("Select Alpha · Task a1").checked).toBe(false)
    selectAll()
    expect(toolbar().getByText("3 selected")).toBeTruthy()
    expect(board().getAttribute("aria-multiselectable")).toBe("true")
    expect(openSupervisedSession).not.toHaveBeenCalled()
    expect(respondToPermission).not.toHaveBeenCalled()
  })

  test("row checkbox clicks and double clicks do not move focus selection or open the row", () => {
    render(<MissionControl />)
    const input = checkbox("Select Beta · Task b1")
    fireEvent.click(input)
    act(() => input.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })))
    expect(input.checked).toBe(true)
    expect(board().getAttribute("aria-activedescendant")).toBe("mission-row-a1")
    expect(openSupervisedSession).not.toHaveBeenCalled()
    expect(document.querySelector(".mission-control-peek")).toBeNull()
    fireEvent.click(input)
    expect(input.checked).toBe(false)
  })

  test("Escape clears selection before closing details or the board", () => {
    render(<MissionControl />)
    key(" ")
    key("x")
    key("Escape")
    expect(screen.queryByRole("toolbar")).toBeNull()
    expect(document.getElementById("mission-details-a1")).not.toBeNull()
    expect(useSupervisionStore.getState().missionControlOpen).toBe(true)
    key("Escape")
    expect(document.getElementById("mission-details-a1")).toBeNull()
    expect(useSupervisionStore.getState().missionControlOpen).toBe(true)
    key("Escape")
    expect(useSupervisionStore.getState().missionControlOpen).toBe(false)
  })

  test("Escape in search belongs to the field; Escape on the board then clears the selection", () => {
    render(<MissionControl />)
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Alpha" } })
    selectAll()
    fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Escape" })
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("")
    expect(screen.getByRole("toolbar")).toBeTruthy()
    fireEvent.keyDown(board(), { key: "Escape" })
    expect(screen.queryByRole("toolbar")).toBeNull()
  })

  test("group checkbox is unchecked, mixed, checked, then clears only its project", () => {
    render(<MissionControl />)
    const group = checkbox("Select all in Alpha")
    expect(group.checked).toBe(false)
    expect(group.indeterminate).toBe(false)
    fireEvent.click(checkbox("Select Alpha · Task a1"))
    expect(group.indeterminate).toBe(true)
    expect(group.getAttribute("aria-checked")).toBe("mixed")
    fireEvent.click(group)
    expect(group.checked).toBe(true)
    expect(group.indeterminate).toBe(false)
    expect(group.getAttribute("aria-checked")).toBe("true")
    fireEvent.click(checkbox("Select Beta · Task b1"))
    fireEvent.click(group)
    expect(group.checked).toBe(false)
    expect(group.getAttribute("aria-checked")).toBe("false")
    expect(toolbar().getByText("1 selected")).toBeTruthy()
    expect(checkbox("Select Beta · Task b1").checked).toBe(true)
  })

  test("filtering prunes hidden IDs permanently", () => {
    render(<MissionControl />)
    selectAll()
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Alpha" } })
    expect(toolbar().getByText("2 selected")).toBeTruthy()
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } })
    expect(checkbox("Select Beta · Task b1").checked).toBe(false)
    expect(toolbar().getByText("2 selected")).toBeTruthy()
  })

  test("collapse prunes the group and Shift+x includes only expanded rows", () => {
    render(<MissionControl />)
    selectAll()
    fireEvent.click(screen.getByRole("button", { name: "Collapse Alpha" }))
    expect(toolbar().getByText("1 selected")).toBeTruthy()
    expect(checkbox("Select all in Alpha").disabled).toBe(true)
    selectAll()
    fireEvent.click(screen.getByRole("button", { name: "Expand Alpha" }))
    expect(checkbox("Select Alpha · Task a1").checked).toBe(false)
    expect(checkbox("Select Alpha · Task a2").checked).toBe(false)
    expect(toolbar().getByText("1 selected")).toBeTruthy()
  })

  test("working set scope changes and removed rows prune selection", () => {
    render(<MissionControl />)
    selectAll()
    fireEvent.click(screen.getByRole("button", { name: "Review" }))
    expect(toolbar().getByText("1 selected")).toBeTruthy()
    act(() => useSupervisionStore.setState({ rows: [] }))
    expect(screen.queryByRole("toolbar")).toBeNull()
  })

  test("clear returns focus to the board and modified or editable x does not select", () => {
    render(<MissionControl />)
    fireEvent.keyDown(board(), { key: "x", ctrlKey: true })
    fireEvent.keyDown(screen.getByRole("searchbox"), { key: "x" })
    expect(screen.queryByRole("toolbar")).toBeNull()
    selectAll()
    fireEvent.click(toolbar().getByRole("button", { name: "Clear selection" }))
    expect(screen.queryByRole("toolbar")).toBeNull()
    expect(document.activeElement).toBe(board())
  })
})

describe("Mission Control bulk actions", () => {
  test("adds selected sessions to an existing working set without duplicates", () => {
    render(<MissionControl />)
    selectAll()
    chooseSet("set-a")
    expect(useSupervisionStore.getState().workingSets[0].sessionIds).toEqual(["a2", "a1", "b1"])
    expect(useSupervisionStore.getState().activeWorkingSetId).toBeNull()
  })

  test("creates a named working set from selection and activates it like the peek flow", () => {
    render(<MissionControl />)
    fireEvent.click(checkbox("Select all in Alpha"))
    chooseSet("__new__")
    const create = toolbar().getByRole("button", { name: "Create working set" }) as HTMLButtonElement
    expect(create.disabled).toBe(true)
    const name = toolbar().getByRole("textbox", { name: "Working set name" })
    fireEvent.change(name, { target: { value: "  Batch  " } })
    fireEvent.keyDown(name, { key: "Enter" })
    const state = useSupervisionStore.getState()
    expect(state.workingSets.find((set) => set.id === state.activeWorkingSetId)).toMatchObject({
      name: "Batch",
      sessionIds: ["a1", "a2"],
    })
    expect(toolbar().queryByRole("textbox")).toBeNull()
  })

  test("Escape in the new working set input cancels the name without dropping the selection", () => {
    render(<MissionControl />)
    selectAll()
    chooseSet("__new__")
    fireEvent.keyDown(toolbar().getByRole("textbox", { name: "Working set name" }), { key: "Escape" })
    expect(useSupervisionStore.getState().workingSets).toHaveLength(1)
    expect(screen.getByRole("toolbar")).toBeTruthy()
  })

  test("stop is disabled when selection has no running sessions", () => {
    render(<MissionControl />)
    fireEvent.click(checkbox("Select Alpha · Task a2"))
    const stop = toolbar().getByRole("button", { name: "Stop 0 running" }) as HTMLButtonElement
    expect(stop.disabled).toBe(true)
    fireEvent.click(stop)
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(abortCurrentOperation).not.toHaveBeenCalled()
  })

  test("stop confirms destructively and aborts only running sessions sequentially", async () => {
    let finishFirst!: () => void
    vi.mocked(abortCurrentOperation).mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        finishFirst = resolve
      })
      return true
    })
    render(<MissionControl />)
    selectAll()
    fireEvent.click(toolbar().getByRole("button", { name: "Stop 2 running" }))
    expect(screen.getByText("Stop running sessions (2)?")).toBeTruthy()
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm" }).className).toContain(
      "bg-destructive",
    )
    expect(abortCurrentOperation).not.toHaveBeenCalled()
    await answer("Confirm")
    expect(vi.mocked(abortCurrentOperation).mock.calls).toEqual([["a1"]])
    expect((toolbar().getByRole("button", { name: "Archive selected" }) as HTMLButtonElement).disabled).toBe(true)
    await act(async () => finishFirst())
    expect(vi.mocked(abortCurrentOperation).mock.calls).toEqual([["a1"], ["b1"]])
    expect(toast.success).toHaveBeenCalledWith("Stopped: 2. Failed: 0. No longer running: 0.")
    expect(respondToPermission).not.toHaveBeenCalled()
  })

  test("stop counts reported runtime failures and continues after thrown failures", async () => {
    vi.mocked(abortCurrentOperation).mockResolvedValueOnce(false).mockRejectedValueOnce(new Error("offline"))
    render(<MissionControl />)
    selectAll()
    fireEvent.click(toolbar().getByRole("button", { name: "Stop 2 running" }))
    await answer("Confirm")
    expect(vi.mocked(abortCurrentOperation).mock.calls).toEqual([["a1"], ["b1"]])
    expect(toast.error).toHaveBeenCalledWith("Stopped: 0. Failed: 2. No longer running: 0.")
  })

  test("stop skips a session that requests permission while confirmation is open", async () => {
    render(<MissionControl />)
    selectAll()
    fireEvent.click(toolbar().getByRole("button", { name: "Stop 2 running" }))
    act(() =>
      useSupervisionStore.setState({
        rows: useSupervisionStore
          .getState()
          .rows.map((item) => (item.sessionId === "a1" ? { ...item, state: "permission" } : item)),
      }),
    )
    await answer("Confirm")
    expect(vi.mocked(abortCurrentOperation).mock.calls).toEqual([["b1"]])
    expect(toast.success).toHaveBeenCalledWith("Stopped: 1. Failed: 0. No longer running: 1.")
    expect(respondToPermission).not.toHaveBeenCalled()
  })

  test("archive confirms, suppresses individual notifications, and summarizes partial failure", async () => {
    vi.mocked(archiveSession).mockResolvedValueOnce(false).mockRejectedValueOnce(new Error("offline"))
    render(<MissionControl />)
    selectAll()
    fireEvent.click(toolbar().getByRole("button", { name: "Archive selected" }))
    expect(screen.getByText("Archive selected sessions (3)?")).toBeTruthy()
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm" }).className).toContain(
      "bg-destructive",
    )
    expect(archiveSession).not.toHaveBeenCalled()
    await answer("Confirm")
    expect(vi.mocked(archiveSession).mock.calls).toEqual([
      ["a1", { notify: false }],
      ["a2", { notify: false }],
      ["b1", { notify: false }],
    ])
    expect(toast.error).toHaveBeenCalledWith("Archived: 1. Failed: 2.")
  })

  test("archive continues sequentially as completed rows and the toolbar disappear", async () => {
    let finishFirst!: () => void
    vi.mocked(archiveSession).mockImplementation(async (id) => {
      useSupervisionStore.setState({
        rows: useSupervisionStore.getState().rows.filter((item) => item.sessionId !== id),
      })
      if (id === "a1")
        await new Promise<void>((resolve) => {
          finishFirst = resolve
        })
      return true
    })
    render(<MissionControl />)
    selectAll()
    fireEvent.click(toolbar().getByRole("button", { name: "Archive selected" }))
    await answer("Confirm")
    expect(archiveSession).toHaveBeenCalledTimes(1)
    expect(toolbar().getByText("2 selected")).toBeTruthy()
    await act(async () => finishFirst())
    expect(vi.mocked(archiveSession).mock.calls.map(([id]) => id)).toEqual(["a1", "a2", "b1"])
    expect(screen.queryByRole("toolbar")).toBeNull()
    expect(toast.success).toHaveBeenCalledWith("Archived: 3. Failed: 0.")
  })

  test("confirmation keeps its original targets when the visible scope changes", async () => {
    render(<MissionControl />)
    fireEvent.click(checkbox("Select all in Alpha"))
    fireEvent.click(toolbar().getByRole("button", { name: "Archive selected" }))
    act(() => useSupervisionStore.setState({ activeWorkingSetId: "set-a" }))
    expect(toolbar().getByText("1 selected")).toBeTruthy()
    await answer("Confirm")
    expect(vi.mocked(archiveSession).mock.calls.map(([id]) => id)).toEqual(["a1", "a2"])
    expect(toast.success).toHaveBeenCalledWith("Archived: 2. Failed: 0.")
  })

  test.each(["Stop 2 running", "Archive selected"])("cancel does nothing for %s", async (name) => {
    render(<MissionControl />)
    selectAll()
    fireEvent.click(toolbar().getByRole("button", { name }))
    await answer("Cancel")
    expect(abortCurrentOperation).not.toHaveBeenCalled()
    expect(archiveSession).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
    expect(toolbar().getByText("3 selected")).toBeTruthy()
    expect((toolbar().getByRole("button", { name: "Archive selected" }) as HTMLButtonElement).disabled).toBe(false)
  })

  test("pop-out retains working runtime stop and archive actions", async () => {
    render(<MissionControl variant="popout" />)
    selectAll()
    fireEvent.click(toolbar().getByRole("button", { name: "Stop 2 running" }))
    await answer("Confirm")
    expect(abortCurrentOperation).toHaveBeenCalledTimes(2)
    fireEvent.click(toolbar().getByRole("button", { name: "Archive selected" }))
    await answer("Confirm")
    expect(archiveSession).toHaveBeenCalledTimes(3)
    expect(toast.success).toHaveBeenCalledWith("Archived: 3. Failed: 0.")
    expect(openSupervisedSession).not.toHaveBeenCalled()
    expect(useSupervisionStore.getState().missionControlOpen).toBe(true)
  })
})
