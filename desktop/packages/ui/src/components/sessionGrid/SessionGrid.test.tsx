import React, { act } from "react"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@/test/dom"
import type { SupervisionRow } from "@/lib/supervision/rows"
import { restoreSessionGrid } from "@/lib/supervision/sessionGrid"
import { SESSION_GRID_RATIOS_KEY } from "@/lib/supervision/sessionGridPreferences"
import { useUIStore } from "@/stores/useUIStore"
import { getSafeStorage } from "@/stores/utils/safeStorage"
import { useSupervisionStore } from "@/stores/useSupervisionStore"
import { useWebMcpBrowserStore } from "@/stores/useWebMcpBrowserStore"
import { viewKeyFor } from "@/lib/webMcpViewKey"
import { openSessionGrid } from "@/lib/supervision/openSessionGrid"
import { openSupervisedSession } from "@/lib/supervision/openSession"
import { SessionGrid } from "./SessionGrid"
import { MiniChatGridReturn } from "@/apps/MiniChatGridReturn"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { useDirectoryStore } from "@/stores/useDirectoryStore"
import { trackGridWindows, useGridWindowOwners } from "@/lib/supervision/sessionGridPopout"
const live = vi.hoisted(() => ({
  rows: [] as SupervisionRow[],
  canWindow: false,
  openWindow: vi.fn(async () => true),
  windows: [] as Array<{ sessionId: string; directory: string }>,
  closeWindow: vi.fn(async () => null),
  inventory: vi.fn(),
}))
vi.mock("@/lib/desktop", async (original) => ({
  ...await original<typeof import("@/lib/desktop")>(),
  invokeDesktop: (command: string) => command === "desktop_list_session_mini_chat_windows"
    ? live.inventory()
    : live.closeWindow(),
}))
vi.mock("@/hooks/useSupervisionRows", () => ({ useSupervisionRows: () => live.rows }))
vi.mock("@/lib/supervision/openSession", () => ({ openSupervisedSession: vi.fn() }))
vi.mock("@/lib/supervision/openSessionWindow", () => ({
  canOpenSessionWindow: () => live.canWindow,
  openSessionWindow: () => live.openWindow(),
}))
vi.mock("@/contexts/useThemeSystem", () => ({
  useThemeSystem: () => ({ themeMode: "dark", lightThemeId: "light", darkThemeId: "dark", currentTheme: null }),
}))
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      if (!params) return key
      if (Object.keys(params).length === 1 && Object.hasOwn(params, "count")) return `${key} ${params.count}`
      if (params.title) return `${key} ${params.title}${params.count ? ` ${params.count}` : ""}`
      return key
    },
  }),
}))
const row = (id: string): SupervisionRow => ({
  sessionId: id,
  directory: `C:/repo-${id}`,
  title: `Task ${id}`,
  projectLabel: `Project ${id}`,
  projectId: id,
  state: "idle",
  treeSessionIds: [id],
  updatedAt: 0,
  evidence: null,
  goal: null,
})
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  )
  live.canWindow = false
  live.openWindow.mockReset()
  live.windows = []
  live.inventory.mockReset().mockImplementation(async () => live.windows.slice())
  live.closeWindow.mockReset().mockResolvedValue(null)
  useGridWindowOwners.setState({ owners: new Set() })
  live.openWindow.mockImplementation(async () => {
    live.windows = [{ sessionId: "a", directory: "C:/repo-a" }]
    return true
  })
  live.rows = [row("a"), row("b"), row("c"), row("d"), row("e")]
  getSafeStorage().removeItem(SESSION_GRID_RATIOS_KEY)
  useWebMcpBrowserStore.setState({ views: {} })
  useUIStore.setState({ mainTabGuard: null, activeMainTab: "chat" })
  openSessionGrid(live.rows)
})
afterEach(() => {
  cleanup()
  trackGridWindows()()
  GridChannel.instances.clear()
  vi.restoreAllMocks()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})
test("caps lazy embedded realms at four, keeps headers and independent normalized URLs", () => {
  const { container } = render(<SessionGrid />)
  expect(container.querySelectorAll("iframe")).toHaveLength(0)
  act(() => vi.advanceTimersByTime(0))
  expect(container.querySelectorAll("iframe")).toHaveLength(1)
  act(() => vi.advanceTimersByTime(400))
  const frames = [...container.querySelectorAll("iframe")]
  expect(frames).toHaveLength(4)
  frames.forEach((frame, i) => {
    const url = new URL(frame.src)
    expect(url.searchParams.get("sessionId")).toBe(live.rows[i].sessionId)
    expect(url.searchParams.get("directory")).toBe(live.rows[i].directory)
    expect(url.searchParams.get("ocPanel")).toBe("session-chat")
    expect(frame.title).toBe(live.rows[i].title)
  })
  expect(container.querySelectorAll("[data-supervision-state=idle]")).toHaveLength(4)
})
test("missing sessions show explanations and can be replaced; close releases the realm", () => {
  useUIStore
    .getState()
    .setSessionGrid(restoreSessionGrid({ layout: 1, slots: [{ sessionId: "gone", directory: "/deleted" }] }))
  const { container } = render(<SessionGrid />)
  act(() => vi.runAllTimers())
  expect(container.querySelectorAll("iframe")).toHaveLength(0)
  expect(screen.getByRole("status").textContent).toBe("sessionGrid.unavailable")
  fireEvent.change(screen.getByRole("combobox", { name: "sessionGrid.add" }), {
    // Options carry the session's identity, not its position in the ranked list.
    target: { value: `${live.rows[1].sessionId}\u0000${live.rows[1].directory}` },
  })
  act(() => vi.runAllTimers())
  expect(new URL(container.querySelector("iframe")!.src).searchParams.get("sessionId")).toBe("b")
  fireEvent.click(screen.getByRole("button", { name: "sessionGrid.focus" }))
  expect(openSupervisedSession).toHaveBeenCalledWith(live.rows[1])
  fireEvent.click(screen.getByRole("button", { name: "sessionGrid.close" }))
  expect(container.querySelector("iframe")).toBeNull()
  expect(useUIStore.getState().sessionGrid.slots).toEqual([null])
})
test("entry closes overlays, returning restores slots, and guards preserve existing grid", () => {
  const saved = useUIStore.getState().sessionGrid
  useUIStore.setState({ activeMainTab: "chat" })
  useSupervisionStore.setState({ missionControlOpen: true, compareRunGroupKey: "run" })
  openSessionGrid()
  expect(useUIStore.getState().activeMainTab).toBe("session-grid")
  expect(useUIStore.getState().sessionGrid).toEqual(saved)
  expect(useSupervisionStore.getState().missionControlOpen).toBe(false)
  expect(useSupervisionStore.getState().compareRunGroupKey).toBeNull()
  useUIStore.setState({ activeMainTab: "chat", mainTabGuard: () => false })
  openSessionGrid([live.rows[4]])
  expect(useUIStore.getState().sessionGrid).toEqual(saved)
  expect(useUIStore.getState().activeMainTab).toBe("chat")
})
test("replacing a pane offers sessions outside other panes", () => {
  render(<SessionGrid />)
  const pane = screen.getByLabelText("sessionGrid.pane 1")
  const select = within(pane).getByRole("combobox", { name: "sessionGrid.replace" }) as HTMLSelectElement
  expect([...select.options].map((o) => o.text)).toEqual([
    "sessionGrid.replace",
    "Project a — Task a",
    "Project e — Task e",
  ])
})

const measureGrid = () => {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1006)
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(806)
}

const pointer = (target: Element, type: string, clientX: number, clientY: number) => {
  act(() => {
    target.dispatchEvent(
      new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, button: 0, clientX, clientY }),
    )
  })
}

const slot = (container: HTMLElement, index: number) =>
  container.querySelector(`[data-session-grid-slot="${index}"]`) as HTMLElement

test("dragging a header onto another pane center swaps the sessions", () => {
  measureGrid()
  useUIStore.getState().setSessionGrid(
    restoreSessionGrid({
      layout: 2,
      slots: [
        { sessionId: "a", directory: "C:/repo-a" },
        { sessionId: "b", directory: "C:/repo-b" },
      ],
      ratios: { columns: 0.5, rows: 0.5 },
    }),
  )
  const { container } = render(<SessionGrid />)
  const handle = slot(container, 0).querySelector("[data-session-grid-handle]")!
  const target = slot(container, 1)
  pointer(handle, "pointerdown", 20, 20)
  pointer(handle, "pointermove", Number.parseFloat(target.style.left) + Number.parseFloat(target.style.width) / 2, 400)
  pointer(handle, "pointerup", Number.parseFloat(target.style.left) + Number.parseFloat(target.style.width) / 2, 400)
  expect(slot(container, 0).dataset.sessionGridSession).toBe("b")
  expect(slot(container, 1).dataset.sessionGridSession).toBe("a")
  expect(useUIStore.getState().sessionGrid.tree ?? null).toBeNull()
})

test("dropping on a pane edge docks the dragged pane on that side", () => {
  measureGrid()
  useUIStore.getState().setSessionGrid(
    restoreSessionGrid({
      layout: 2,
      slots: [
        { sessionId: "a", directory: "C:/repo-a" },
        { sessionId: "b", directory: "C:/repo-b" },
      ],
      ratios: { columns: 0.5, rows: 0.5 },
    }),
  )
  const { container } = render(<SessionGrid />)
  const handle = slot(container, 0).querySelector("[data-session-grid-handle]")!
  const target = slot(container, 1)
  const x = Number.parseFloat(target.style.left) + Number.parseFloat(target.style.width) - 8
  pointer(handle, "pointerdown", 20, 20)
  pointer(handle, "pointermove", x, 400)
  pointer(handle, "pointerup", x, 400)
  expect(slot(container, 0).dataset.sessionGridSession).toBe("a")
  expect(Number.parseFloat(slot(container, 0).style.left)).toBeGreaterThan(
    Number.parseFloat(slot(container, 1).style.left) + Number.parseFloat(slot(container, 1).style.width),
  )
  expect(useUIStore.getState().sessionGrid.tree).not.toBeNull()
})

test("arrow keys and move buttons trade a pane with its neighbor", () => {
  useUIStore.getState().setSessionGrid(
    restoreSessionGrid({
      layout: 2,
      slots: [
        { sessionId: "a", directory: "C:/repo-a" },
        { sessionId: "b", directory: "C:/repo-b" },
      ],
    }),
  )
  const { container } = render(<SessionGrid />)
  const pane = slot(container, 0)
  expect((within(pane).getByRole("button", { name: "sessionGrid.moveLeft" }) as HTMLButtonElement).disabled).toBe(true)
  expect((within(pane).getByRole("button", { name: "sessionGrid.moveUp" }) as HTMLButtonElement).disabled).toBe(true)
  expect((within(pane).getByRole("button", { name: "sessionGrid.moveRight" }) as HTMLButtonElement).disabled).toBe(false)
  const handle = pane.querySelector("[data-session-grid-handle]") as HTMLElement
  handle.focus()
  fireEvent.keyDown(handle, { key: "ArrowRight" })
  expect(slot(container, 0).dataset.sessionGridSession).toBe("b")
  fireEvent.click(within(slot(container, 0)).getByRole("button", { name: "sessionGrid.moveRight" }))
  expect(slot(container, 0).dataset.sessionGridSession).toBe("a")
})

test("the split menu adds an empty pane and a full grid cannot grow", () => {
  render(<SessionGrid />)
  for (const select of screen.getAllByRole("combobox", { name: "sessionGrid.split" })) {
    expect((select as HTMLSelectElement).disabled).toBe(true)
    expect(select.getAttribute("title")).toBe("sessionGrid.splitLimit")
  }
  cleanup()
  useUIStore.getState().setSessionGrid(
    restoreSessionGrid({
      layout: 2,
      slots: [
        { sessionId: "a", directory: "C:/repo-a" },
        { sessionId: "b", directory: "C:/repo-b" },
      ],
    }),
  )
  const next = render(<SessionGrid />)
  fireEvent.change(within(slot(next.container, 0)).getByRole("combobox", { name: "sessionGrid.split" }), {
    target: { value: "bottom" },
  })
  expect(next.container.querySelectorAll("[data-session-grid-slot]")).toHaveLength(3)
  expect(screen.getByRole("status").textContent).toBe("sessionGrid.empty")
  expect(useUIStore.getState().sessionGrid.slots).toHaveLength(3)
  expect(useUIStore.getState().sessionGrid.tree).not.toBeNull()
})

test("preset split sizes are remembered separately for each layout", () => {
  measureGrid()
  useUIStore.getState().setSessionGrid(
    restoreSessionGrid({
      layout: 2,
      slots: [
        { sessionId: "a", directory: "C:/repo-a" },
        { sessionId: "b", directory: "C:/repo-b" },
      ],
      ratios: { columns: 0.5, rows: 0.5 },
    }),
  )
  render(<SessionGrid />)
  const columns = () => screen.getByRole("separator", { name: "sessionGrid.resizeColumns" })
  expect(columns().getAttribute("aria-valuenow")).toBe("50")
  fireEvent.keyDown(columns(), { key: "ArrowLeft" })
  expect(columns().getAttribute("aria-valuenow")).toBe("48")
  fireEvent.change(screen.getByRole("combobox", { name: "sessionGrid.layout" }), { target: { value: "4" } })
  expect(columns().getAttribute("aria-valuenow")).toBe("50")
  fireEvent.keyDown(columns(), { key: "ArrowRight" })
  expect(columns().getAttribute("aria-valuenow")).toBe("52")
  fireEvent.change(screen.getByRole("combobox", { name: "sessionGrid.layout" }), { target: { value: "2" } })
  expect(columns().getAttribute("aria-valuenow")).toBe("48")
})

class GridChannel {
  static instances = new Set<GridChannel>()
  onmessage: ((event: { data: unknown }) => void) | null = null
  constructor(name: string) {
    void name
    GridChannel.instances.add(this)
  }
  postMessage(data: unknown) {
    for (const instance of GridChannel.instances) {
      if (instance !== this) instance.onmessage?.({ data })
    }
  }
  close() {
    GridChannel.instances.delete(this)
  }
}

const oneSession = () => {
  live.canWindow = true
  vi.stubGlobal("BroadcastChannel", GridChannel)
  useSessionUIStore.setState({ currentSessionId: null })
  useDirectoryStore.setState({ currentDirectory: "" })
  useUIStore.getState().setSessionGrid(
    restoreSessionGrid({ layout: 1, slots: [{ sessionId: "a", directory: "C:/repo-a" }] }),
  )
}
const flush = async () => { await act(async () => { await Promise.resolve() }) }
const pop = async () => {
  fireEvent.click(screen.getByRole("button", { name: "sessionGrid.popOut Task a" }))
  await flush()
}
const closeNativeWindow = async () => {
  live.windows = []
  await act(async () => {
    window.dispatchEvent(new Event("openchamber:session-windows-changed"))
  })
}

test("return receiver retains ownership through pending, rejected and vetoed closure until native release", async () => {
  oneSession()
  const stored = useUIStore.getState().sessionGrid.slots[0]!
  useWebMcpBrowserStore.getState().updateView(viewKeyFor(stored.directory, stored.sessionId), {
    browserId: "page-a", directory: stored.directory, sessionID: stored.sessionId, origin: "https://a.test",
  })
  const { container } = render(<><SessionGrid /><MiniChatGridReturn config={stored} /></>)
  await flush()
  act(() => vi.runAllTimers())
  expect(container.querySelector("iframe")).not.toBeNull()
  await pop()
  expect(container.querySelector("iframe")).toBeNull()
  expect(container.querySelector("[data-webmcp-session-page]")).toBeNull()
  let rejectClose!: (error: Error) => void
  live.closeWindow.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectClose = reject }))
  fireEvent.click(screen.getByRole("button", { name: "sessionGrid.popIn Task a" }))
  await flush()
  expect(live.closeWindow).toHaveBeenCalledOnce()
  expect(container.querySelector("iframe")).toBeNull()
  await act(async () => { rejectClose(new Error("close rejected")) })
  expect(container.querySelector("iframe")).toBeNull()
  // Visibility false, including beforeunload, is not proof that close succeeded.
  act(() => new GridChannel("presence").postMessage({ type: "mini-chat-session-presence", ...stored, viewed: false }))
  expect(container.querySelector("iframe")).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: "sessionGrid.popIn Task a" }))
  await flush()
  expect(live.closeWindow).toHaveBeenCalledTimes(2)
  expect(container.querySelector("iframe")).toBeNull()
  await closeNativeWindow()
  act(() => vi.runAllTimers())
  expect(container.querySelector("iframe")).not.toBeNull()
  expect(container.querySelector("[data-webmcp-session-page]")).not.toBeNull()
})

test("failed return messaging and inventory keep the live window exclusive", async () => {
  oneSession()
  const { container } = render(<SessionGrid />)
  await flush()
  await pop()
  vi.stubGlobal("BroadcastChannel", undefined)
  live.inventory.mockRejectedValueOnce(new Error("inventory unavailable"))
  fireEvent.click(screen.getByRole("button", { name: "sessionGrid.popIn Task a" }))
  await flush()
  act(() => vi.runAllTimers())
  expect(container.querySelector("iframe")).toBeNull()
  expect(useUIStore.getState().sessionGrid.slots[0]?.poppedOut).toBe(true)
})

test("replacing, removing and readding a popped session cannot acquire a second owner", async () => {
  oneSession()
  const { container } = render(<SessionGrid />)
  await flush()
  await pop()
  const selectA = (name: string) => fireEvent.change(screen.getByRole("combobox", { name }), {
    target: { value: "a\u0000C:/repo-a" },
  })
  selectA("sessionGrid.replace")
  act(() => vi.runAllTimers())
  expect(container.querySelector("iframe")).toBeNull()
  expect(screen.queryByRole("button", { name: "sessionGrid.popOut Task a" })).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: "sessionGrid.close" }))
  selectA("sessionGrid.add")
  act(() => vi.runAllTimers())
  expect(container.querySelector("iframe")).toBeNull()
  expect(screen.queryByRole("button", { name: "sessionGrid.popOut Task a" })).toBeNull()
  expect(live.openWindow).toHaveBeenCalledOnce()
  await closeNativeWindow()
  act(() => vi.runAllTimers())
  expect(container.querySelector("iframe")).not.toBeNull()
})

test("native closure while the grid is unmounted releases its slot and remount reconciles missed events", async () => {
  oneSession()
  const view = render(<SessionGrid />)
  await flush()
  await pop()
  view.rerender(<div>Workspace</div>)
  await closeNativeWindow()
  expect(useUIStore.getState().sessionGrid.slots[0]?.poppedOut).not.toBe(true)
  view.rerender(<SessionGrid />)
  await flush()
  act(() => vi.runAllTimers())
  expect(view.container.querySelector("iframe")).not.toBeNull()
  await pop()
  view.rerender(<div>Workspace</div>)
  live.windows = [] // Missed native event, such as a renderer reload.
  view.rerender(<SessionGrid />)
  await flush()
  act(() => vi.runAllTimers())
  expect(view.container.querySelector("iframe")).not.toBeNull()
})

test("failed opens restore the embedded page only after inventory confirms no window", async () => {
  oneSession()
  live.openWindow.mockResolvedValue(false)
  const { container } = render(<SessionGrid />)
  await flush()
  await pop()
  act(() => vi.runAllTimers())
  expect(container.querySelector("iframe")).not.toBeNull()
  expect(useUIStore.getState().sessionGrid.slots[0]?.poppedOut).not.toBe(true)
})

for (const edge of ["center", "right"]) test(`pointer cancellation clears the ${edge} preview without persisting a drop`, () => {
  measureGrid()
  const { container } = render(<SessionGrid />)
  const original = useUIStore.getState().sessionGrid
  const handle = slot(container, 0).querySelector("[data-session-grid-handle]")!
  const target = slot(container, 1)
  const x = Number.parseFloat(target.style.left) + Number.parseFloat(target.style.width) * (edge === "center" ? 0.5 : 0.99)
  pointer(handle, "pointerdown", 20, 20)
  pointer(handle, "pointermove", x, 200)
  expect(container.querySelector("[data-grid-drop-edge]")?.getAttribute("data-grid-drop-edge")).toBe(edge)
  pointer(handle, "pointercancel", x, 200)
  expect(container.querySelector("[data-grid-drop-edge]")).toBeNull()
  expect(useUIStore.getState().sessionGrid).toBe(original)
  pointer(handle, "pointerup", x, 200)
  expect(useUIStore.getState().sessionGrid).toBe(original)
})

const leaf = (slot: number) => ({ kind: "leaf" as const, slot })
test("nested columns retain recursive minimum widths after the outer splitter moves", () => {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(492)
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(400)
  useUIStore.getState().setSessionGrid(restoreSessionGrid({
    layout: 3, slots: live.rows.slice(0, 3),
    tree: { kind: "split", id: "s1", axis: "column", ratio: 0.5, first: leaf(0),
      second: { kind: "split", id: "s2", axis: "column", ratio: 0.5, first: leaf(1), second: leaf(2) } },
  }))
  const { container } = render(<SessionGrid />)
  const assertWidths = () => {
    for (let i = 0; i < 3; i++) expect(Number.parseFloat(slot(container, i).style.width)).toBeGreaterThanOrEqual(160 - 1e-6)
  }
  assertWidths()
  const outer = screen.getAllByRole("separator")[1]
  for (let i = 0; i < 30; i++) fireEvent.keyDown(outer, { key: "ArrowRight" })
  assertWidths()
})

test("resized custom columns move to the neighbor shown by the rendered geometry", () => {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1000)
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(400)
  useUIStore.getState().setSessionGrid(restoreSessionGrid({
    layout: 4, slots: live.rows.slice(0, 4),
    tree: { kind: "split", id: "s1", axis: "column", ratio: 0.5,
      first: { kind: "split", id: "s2", axis: "row", ratio: 0.7, first: leaf(0), second: leaf(2) },
      second: { kind: "split", id: "s3", axis: "row", ratio: 0.3, first: leaf(1), second: leaf(3) } },
  }))
  const { container } = render(<SessionGrid />)
  fireEvent.click(within(slot(container, 0)).getByRole("button", { name: "sessionGrid.moveRight" }))
  expect(slot(container, 1).dataset.sessionGridSession).toBe("a")
  expect(slot(container, 3).dataset.sessionGridSession).toBe("d")
})

test("successive arrow moves follow the session focus and announce each destination", () => {
  measureGrid()
  useUIStore.getState().setSessionGrid(restoreSessionGrid({
    layout: 3, slots: live.rows.slice(0, 3),
    tree: { kind: "split", id: "s1", axis: "column", ratio: 0.33, first: leaf(0),
      second: { kind: "split", id: "s2", axis: "column", ratio: 0.5, first: leaf(1), second: leaf(2) } },
  }))
  const { container } = render(<SessionGrid />)
  const handle = slot(container, 0).querySelector<HTMLElement>("[data-session-grid-handle]")!
  expect(handle.getAttribute("aria-label")).toBe("sessionGrid.moveSession Task a")
  handle.focus()
  fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" })
  expect(document.activeElement?.closest("[data-session-grid-slot]")?.getAttribute("data-session-grid-session")).toBe("a")
  expect(container.querySelector("[aria-live=polite]")?.textContent).toBe("sessionGrid.moved Task a 2")
  fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" })
  expect(slot(container, 2).dataset.sessionGridSession).toBe("a")
  expect(document.activeElement).toBe(slot(container, 2).querySelector("[data-session-grid-handle]"))
  expect(document.activeElement?.getAttribute("aria-label")).toBe("sessionGrid.moveSession Task a")
  expect(container.querySelector("[aria-live=polite]")?.textContent).toBe("sessionGrid.moved Task a 3")
})
