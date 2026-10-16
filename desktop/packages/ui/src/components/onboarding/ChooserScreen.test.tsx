import React, { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"

const updateDesktopSettings = vi.fn()
const desktopHostsSet = vi.fn(async () => {})
const toastError = vi.fn()
// Flipped by the tests that need the desktop shell path.
const tauriShell = { current: false }

vi.doMock("@/lib/persistence", () => ({ updateDesktopSettings }))
vi.doMock("@/components/ui", () => ({
  toast: { error: toastError, success: vi.fn(), message: vi.fn(), warning: vi.fn() },
}))
vi.doMock("@/lib/desktop", () => ({
  isDesktopShell: () => false,
  isTauriShell: () => tauriShell.current,
  startDesktopWindowDrag: () => {},
  restartDesktopApp: async () => {},
}))
vi.doMock("@/lib/desktopHosts", () => ({
  desktopHostsGet: async () => ({ hosts: [], defaultHostId: "local" }),
  desktopHostsSet,
}))

const { ChooserScreen } = await import("./ChooserScreen")

describe("ChooserScreen custom binary path", () => {
  const roots: Array<ReturnType<typeof createRoot>> = []

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount())
    }
    updateDesktopSettings.mockReset()
    desktopHostsSet.mockClear()
    desktopHostsSet.mockImplementation(async () => {})
    toastError.mockReset()
    tauriShell.current = false
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  test("surfaces a settings write that failed instead of clearing the busy state in silence", async () => {
    // The click only cleared the busy flag a second later: the rejection escaped the handler
    // and the screen said nothing, so the path looked applied when nothing was stored.
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })))
    updateDesktopSettings.mockRejectedValueOnce(new Error("settings write failed"))

    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    roots.push(root)

    act(() => {
      root.render(
        <I18nProvider>
          <ChooserScreen />
        </I18nProvider>,
      )
    })

    const apply = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Apply"),
    ) as HTMLButtonElement
    const input = apply?.parentElement?.querySelector("input") as HTMLInputElement
    expect(apply).toBeTruthy()
    expect(input).toBeTruthy()

    // The Apply button is gated on a non-empty path, and React tracks the last value it wrote
    // on the node, so the edit goes through the native setter.
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set
      setter?.call(input, "/opt/ax-code/bin/ax-code")
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })

    await act(async () => {
      apply.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(updateDesktopSettings).toHaveBeenCalled()
    const alert = container.querySelector('[role="alert"]')
    expect(alert?.textContent).toContain("settings write failed")
  })
})

describe("ChooserScreen CLI check", () => {
  const roots: Array<ReturnType<typeof createRoot>> = []

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount())
    }
    updateDesktopSettings.mockReset()
    toastError.mockReset()
    tauriShell.current = false
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  const renderChooser = () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    roots.push(root)
    act(() => {
      root.render(
        <I18nProvider>
          <ChooserScreen />
        </I18nProvider>,
      )
    })
    return { container, root }
  }

  test("reports a verified CLI whose choice could not be recorded", async () => {
    // Reachable CLI, failing write: the poll used to swallow the rejection and try again every couple
    // of seconds, so the user sat behind the "watching" spinner with nothing said.
    tauriShell.current = true
    desktopHostsSet.mockRejectedValue(new Error("hosts write failed"))
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ axCodeRunning: true }), { status: 200 })),
    )

    const { container } = renderChooser()
    const checkNow = Array.from(container.querySelectorAll("button")).find((button) =>
      (button.textContent ?? "").includes("Check"),
    )
    expect(checkNow).toBeDefined()

    await act(async () => {
      checkNow?.click()
    })
    await act(async () => {})

    expect(desktopHostsSet).toHaveBeenCalled()
    expect(toastError).toHaveBeenCalledWith("hosts write failed")
  })
})
