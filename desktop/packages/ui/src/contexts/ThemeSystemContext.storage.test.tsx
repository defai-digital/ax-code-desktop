import React from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("@/lib/desktop", () => ({
  isDesktopLocalOriginActive: () => false,
  isTauriShell: () => false,
}))
vi.mock("@/lib/desktopNative", () => ({ setDesktopWindowTheme: vi.fn() }))
vi.mock("@/lib/persistence", () => ({ updateDesktopSettings: vi.fn(async () => {}) }))

import { ThemeSystemProvider } from "./ThemeSystemContext"

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
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
})
