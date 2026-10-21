import React from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
  }),
}))

let electron = true
vi.mock("@/lib/desktop", () => ({ isElectronShell: () => electron }))

let surfaceMode: "main" | "mini-chat" = "main"
vi.mock("@/components/chat/useChatSurfaceMode", () => ({ useChatSurfaceMode: () => surfaceMode }))

const openProjectBrowser = vi.fn()
vi.mock("@/hooks/useWebMcpBrowser", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useWebMcpBrowser")>()),
  useOpenProjectBrowser: () => openProjectBrowser,
}))

import { useWebMcpBrowserStore } from "@/stores/useWebMcpBrowserStore"
import { WebMcpBrowserErrorAction } from "./WebMcpBrowserErrorAction"

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

const setBrowser = (partial: Partial<{ enabled: boolean; origin: string | null; busy: boolean }>) =>
  useWebMcpBrowserStore.setState(partial)

describe("WebMcpBrowserErrorAction", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    electron = true
    surfaceMode = "main"
    openProjectBrowser.mockClear()
    setBrowser({ enabled: false, origin: null, busy: false })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    React.act(() => root.unmount())
    container.remove()
    setBrowser({ enabled: false, origin: null, busy: false })
  })

  const button = () => container.querySelector("button")

  test("offers to enable agent access while the browser is not enrolled", () => {
    React.act(() => root.render(<WebMcpBrowserErrorAction />))
    expect(button()?.textContent).toContain("webmcp.actions.enable")
    React.act(() => button()!.click())
    expect(openProjectBrowser).toHaveBeenCalledWith({ enable: true })
  })

  test("offers to open the pane when the browser is enrolled without a grantable page", () => {
    setBrowser({ enabled: true, origin: null })
    React.act(() => root.render(<WebMcpBrowserErrorAction />))
    expect(button()?.textContent).toContain("webmcp.actions.open")
    React.act(() => button()!.click())
    expect(openProjectBrowser).toHaveBeenCalledWith({ enable: false })
  })

  test("hides once the browser is enrolled with a grantable page", () => {
    setBrowser({ enabled: true, origin: "https://example.com" })
    React.act(() => root.render(<WebMcpBrowserErrorAction />))
    expect(button()).toBeNull()
  })

  test("hides outside the desktop app", () => {
    electron = false
    React.act(() => root.render(<WebMcpBrowserErrorAction />))
    expect(button()).toBeNull()
  })

  test("hides in the mini chat, which has no browser pane", () => {
    surfaceMode = "mini-chat"
    React.act(() => root.render(<WebMcpBrowserErrorAction />))
    expect(button()).toBeNull()
  })

  test("stays disabled while the pane is mid-operation", () => {
    setBrowser({ busy: true })
    React.act(() => root.render(<WebMcpBrowserErrorAction />))
    expect(button()?.disabled).toBe(true)
  })
})
