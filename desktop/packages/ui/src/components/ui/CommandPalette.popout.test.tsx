import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const desktop = vi.hoisted(() => ({ electron: true, invoke: vi.fn(async () => null) }))

vi.mock("@/lib/desktop", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/desktop")>()
  return {
    ...actual,
    canUseLocalElectronDesktopIPC: () => desktop.electron,
    invokeDesktop: desktop.invoke,
  }
})
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock("@/contexts/useThemeSystem", () => ({ useThemeSystem: () => ({ setThemeMode: vi.fn() }) }))
vi.mock("@/hooks/useWebMcpBrowser", () => ({ useOpenProjectBrowser: () => vi.fn() }))
vi.mock("@/hooks/useRuntimeAPIs", () => ({ useRuntimeAPIs: () => ({ git: null, files: null }) }))
vi.mock("@/hooks/useEffectiveDirectory", () => ({ useEffectiveDirectory: () => "/repo" }))

import { useUIStore } from "@/stores/useUIStore"
import { CommandPalette } from "./CommandPalette"

describe("command palette supervision pop-out entry", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    Element.prototype.scrollIntoView = vi.fn()
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
    desktop.invoke.mockClear()
    useUIStore.setState({ isCommandPaletteOpen: true, isCommandPaletteSearchMode: false })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    useUIStore.setState({ isCommandPaletteOpen: false })
  })

  const findEntry = () =>
    Array.from(document.body.querySelectorAll('[cmdk-item], [role="option"]')).find((item) =>
      item.textContent?.includes("supervision.commandPalette.popOut"),
    ) ?? null

  test("offers the pop-out in the Electron shell and invokes the open command", async () => {
    desktop.electron = true
    act(() => root.render(<CommandPalette />))
    const entry = findEntry()
    expect(entry).not.toBeNull()
    await act(async () => {
      entry!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(desktop.invoke).toHaveBeenCalledWith("desktop_open_supervision_window")
  })

  test("has no pop-out entry outside the Electron shell", () => {
    desktop.electron = false
    act(() => root.render(<CommandPalette />))
    expect(findEntry()).toBeNull()
  })
})
