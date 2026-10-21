import React, { act } from "react"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@/test/dom"
import type { SupervisionRow } from "@/lib/supervision/rows"
import { restoreSessionGrid } from "@/lib/supervision/sessionGrid"
import { useUIStore } from "@/stores/useUIStore"
import { useSupervisionStore } from "@/stores/useSupervisionStore"
import { openSessionGrid } from "@/lib/supervision/openSessionGrid"
import { openSupervisedSession } from "@/lib/supervision/openSession"
import { SessionGrid } from "./SessionGrid"
const live = vi.hoisted(() => ({ rows: [] as SupervisionRow[] }))
vi.mock("@/hooks/useSupervisionRows", () => ({ useSupervisionRows: () => live.rows }))
vi.mock("@/lib/supervision/openSession", () => ({ openSupervisedSession: vi.fn() }))
vi.mock("@/contexts/useThemeSystem", () => ({
  useThemeSystem: () => ({ themeMode: "dark", lightThemeId: "light", darkThemeId: "dark", currentTheme: null }),
}))
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({ t: (key: string, params?: { count: number }) => (params ? `${key} ${params.count}` : key) }),
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
  live.rows = [row("a"), row("b"), row("c"), row("d"), row("e")]
  useUIStore.setState({ mainTabGuard: null, activeMainTab: "chat" })
  openSessionGrid(live.rows)
})
afterEach(() => {
  cleanup()
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
