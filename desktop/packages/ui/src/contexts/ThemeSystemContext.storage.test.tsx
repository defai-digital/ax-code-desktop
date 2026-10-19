import React from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("@/lib/desktop", () => ({
  isDesktopLocalOriginActive: () => false,
  isTauriShell: () => false,
}))
vi.mock("@/lib/desktopNative", () => ({ setDesktopWindowTheme: vi.fn() }))
vi.mock("@/lib/persistence", () => ({ updateDesktopSettings: vi.fn(async () => {}) }))

import { generateTheme } from "@/lib/theme/generateTheme"
import { ThemeSystemProvider } from "./ThemeSystemContext"
import { ThemeSystemContext } from "./theme-system-context"

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

const CustomThemeProbe = () => {
  const context = React.useContext(ThemeSystemContext)
  const hasCustomTheme = context?.availableThemes.some((theme) => theme.metadata.id === "generated-retry") ?? false
  return <div data-custom-theme={String(hasCustomTheme)} />
}

describe("theme system storage", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    // jsdom has no matchMedia; the provider subscribes to the system colour scheme.
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({
        matches: false,
        media: "",
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
    })
  })

  afterEach(() => {
    React.act(() => root.unmount())
    container.remove()
    Reflect.deleteProperty(window, "localStorage")
    Reflect.deleteProperty(window, "matchMedia")
    vi.unstubAllGlobals()
  })

  test("mounts when the browser blocks storage access", () => {
    // A browser that blocks site data throws a SecurityError on the property access itself. The
    // provider reads preferences while rendering, so that throw used to take the whole shell down.
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("SecurityError: storage is blocked")
      },
    })

    expect(() =>
      React.act(() => {
        root.render(React.createElement(ThemeSystemProvider, null, null))
      }),
    ).not.toThrow()
  })

  test("retries custom themes when settings sync after an auth-gated fetch", async () => {
    const customTheme = generateTheme({
      id: "generated-retry",
      name: "Generated retry",
      variant: "dark",
      base: "#24262d",
      accent: "#6d75e8",
    })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ status: 401, ok: false })
      .mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({ themes: [customTheme] }) })
    vi.stubGlobal("fetch", fetchMock)

    await React.act(async () => {
      root.render(React.createElement(ThemeSystemProvider, null, React.createElement(CustomThemeProbe)))
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(container.querySelector("[data-custom-theme]")?.getAttribute("data-custom-theme")).toBe("false")

    // The provider mounts outside SessionAuthGate, so the mount-time fetch ran while locked. The
    // gate runs syncDesktopSettings right after unlock, which dispatches this event.
    await React.act(async () => {
      window.dispatchEvent(
        new CustomEvent("openchamber:settings-synced", {
          detail: { useSystemTheme: true, lightThemeId: "default-light", darkThemeId: "default-dark" },
        }),
      )
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/config/themes")
    expect(container.querySelector("[data-custom-theme]")?.getAttribute("data-custom-theme")).toBe("true")
  })
})
