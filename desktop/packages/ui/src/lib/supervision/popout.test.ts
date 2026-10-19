import { beforeEach, describe, expect, test, vi } from "vitest"

const desktop = vi.hoisted(() => ({
  invokeDesktop: vi.fn<(command: string, args?: Record<string, unknown>) => Promise<unknown>>(async () => null),
  canUseLocalElectronDesktopIPC: vi.fn(() => true),
}))
vi.mock("@/lib/desktop", () => desktop)

import {
  openDraftInMainWindow,
  openSessionInMainWindow,
  openSupervisionPopout,
  SUPERVISION_POPOUT_PALETTE_ID,
  supervisionPopoutPaletteEntry,
} from "./popout"

describe("supervision pop-out commands", () => {
  beforeEach(() => {
    desktop.invokeDesktop.mockReset()
    desktop.invokeDesktop.mockResolvedValue(null)
    desktop.canUseLocalElectronDesktopIPC.mockReturnValue(true)
  })

  test("opening the pop-out invokes the desktop command", async () => {
    await expect(openSupervisionPopout()).resolves.toBe(true)
    expect(desktop.invokeDesktop).toHaveBeenCalledWith("desktop_open_supervision_window")
  })

  test("a refused pop-out reports failure instead of throwing", async () => {
    desktop.invokeDesktop.mockRejectedValueOnce(new Error("IPC not available for this origin"))
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    await expect(openSupervisionPopout()).resolves.toBe(false)
    warn.mockRestore()
  })

  test("a session opens through the main-window hand-off with its directory", async () => {
    desktop.invokeDesktop.mockResolvedValueOnce({ focused: true })
    await expect(openSessionInMainWindow({ sessionId: "s1", projectId: "p", directory: "/repo" })).resolves.toBe(true)
    expect(desktop.invokeDesktop).toHaveBeenCalledWith("desktop_focus_main_window", {
      sessionId: "s1",
      directory: "/repo",
    })
  })

  test("a hand-off the main window could not take reports failure", async () => {
    desktop.invokeDesktop.mockResolvedValueOnce({ focused: false })
    await expect(openSessionInMainWindow({ sessionId: "s1" })).resolves.toBe(false)
    expect(desktop.invokeDesktop).toHaveBeenCalledWith("desktop_focus_main_window", { sessionId: "s1", directory: "" })
    await expect(openSessionInMainWindow({ sessionId: "" })).resolves.toBe(false)
    expect(desktop.invokeDesktop).toHaveBeenCalledTimes(1)
  })

  test("a new-session draft opens in the main window", async () => {
    desktop.invokeDesktop.mockResolvedValueOnce({ focused: true })
    await expect(openDraftInMainWindow()).resolves.toBe(true)
    expect(desktop.invokeDesktop).toHaveBeenCalledWith("desktop_focus_main_window", {
      mode: "draft",
      directory: "",
      projectId: null,
    })
  })

  test("the command palette entry exists in the Electron shell and opens the pop-out", async () => {
    const entry = supervisionPopoutPaletteEntry("Open Mission Control in a separate window")
    expect(entry).toMatchObject({
      id: SUPERVISION_POPOUT_PALETTE_ID,
      title: "Open Mission Control in a separate window",
    })
    expect(entry?.searchText).toContain("mission control")
    await entry?.onSelect()
    expect(desktop.invokeDesktop).toHaveBeenCalledWith("desktop_open_supervision_window")
  })

  test("the command palette entry is absent outside the Electron shell", () => {
    desktop.canUseLocalElectronDesktopIPC.mockReturnValue(false)
    expect(supervisionPopoutPaletteEntry("Open Mission Control in a separate window")).toBeNull()
  })
})
