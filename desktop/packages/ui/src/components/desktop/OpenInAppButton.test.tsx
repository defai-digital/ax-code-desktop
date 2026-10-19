import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

type TestOpenInApp = {
  id: string
  label: string
  appName: string
  iconDataUrl?: string
}

const storeState = vi.hoisted(() => ({
  selectedAppId: "finder",
  availableApps: [] as TestOpenInApp[],
  isCacheStale: false,
  isScanning: false,
  initialize: () => {},
  loadInstalledApps: async () => {},
  selectApp: async () => {},
}))

vi.mock("@/lib/desktop", () => ({
  isTauriShell: () => true,
  isDesktopLocalOriginActive: () => true,
  openDesktopProjectInApp: vi.fn(async () => true),
  openDesktopPath: vi.fn(async () => true),
}))
vi.mock("@/components/ui", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/components/icon/Icon", () => ({ Icon: () => null }))
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock("@/stores/useOpenInAppsStore", () => ({
  useOpenInAppsStore: Object.assign((selector: (state: typeof storeState) => unknown) => selector(storeState), {
    getState: () => storeState,
  }),
}))

const { OpenInAppButton } = await import("./OpenInAppButton")

describe("OpenInAppButton icon fallback", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    storeState.selectedAppId = "finder"
    storeState.availableApps = [
      { id: "finder", label: "Finder", appName: "Finder", iconDataUrl: "data:image/png;base64,first" },
      { id: "terminal", label: "Terminal", appName: "Terminal", iconDataUrl: "data:image/png;base64,second" },
    ]
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const renderButton = () => {
    act(() => {
      root.render(<OpenInAppButton directory="/tmp/project" />)
    })
  }

  test("renders an icon that arrives after the first source failed", () => {
    // `failed` used to latch on the first img error, so a refreshed icon source
    // never rendered again for that component instance.
    renderButton()
    const first = container.querySelector("img")
    expect(first?.getAttribute("src")).toBe("data:image/png;base64,first")

    act(() => {
      first?.dispatchEvent(new Event("error", { bubbles: true }))
    })
    expect(container.querySelector("img")).toBeNull()

    storeState.availableApps = [
      { id: "finder", label: "Finder", appName: "Finder", iconDataUrl: "data:image/png;base64,second" },
    ]
    renderButton()

    const second = container.querySelector("img")
    expect(second?.getAttribute("src")).toBe("data:image/png;base64,second")
  })
})
