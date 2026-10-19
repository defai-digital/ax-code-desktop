import React, { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"
import { dict } from "@/lib/i18n/messages/en"

const updateDesktopSettings = vi.fn()
const restartDesktopApp = vi.fn(async () => true)
// Flipped by the tests that need the desktop shell path.
const tauriShell = { current: false }

vi.doMock("@/lib/persistence", () => ({ updateDesktopSettings }))
vi.doMock("@/lib/desktop", () => ({
  isDesktopShell: () => false,
  isTauriShell: () => tauriShell.current,
  startDesktopWindowDrag: () => {},
  restartDesktopApp,
}))

const { LocalSetupScreen } = await import("./LocalSetupScreen")

describe("LocalSetupScreen custom binary path", () => {
  const roots: Array<ReturnType<typeof createRoot>> = []

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount())
    }
    updateDesktopSettings.mockReset()
    restartDesktopApp.mockReset()
    restartDesktopApp.mockResolvedValue(true)
    tauriShell.current = false
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  test("reports a settings write that failed instead of clearing the busy state in silence", async () => {
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
          <LocalSetupScreen onBack={() => {}} />
        </I18nProvider>,
      )
    })

    const input = container.querySelector("input") as HTMLInputElement
    const apply = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Apply"),
    ) as HTMLButtonElement
    expect(input).toBeTruthy()
    expect(apply).toBeTruthy()

    await act(async () => {
      apply.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(updateDesktopSettings).toHaveBeenCalled()
    expect(container.textContent).toContain("settings write failed")
  })

  test("surfaces a desktop restart that returned false after the path was saved", async () => {
    // `restartDesktopApp` resolves false on a failed invoke. Ignoring it left the path
    // saved and the old binary still running, with nothing on screen to say so.
    tauriShell.current = true
    restartDesktopApp.mockResolvedValue(false)
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })))

    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    roots.push(root)

    act(() => {
      root.render(
        <I18nProvider>
          <LocalSetupScreen onBack={() => {}} />
        </I18nProvider>,
      )
    })

    const input = container.querySelector("input") as HTMLInputElement
    const apply = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Apply"),
    ) as HTMLButtonElement
    expect(input).toBeTruthy()
    expect(apply).toBeTruthy()

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set
      setter?.call(input, "/opt/ax-code/bin/ax-code")
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })

    await act(async () => {
      apply.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    await act(async () => {})

    expect(restartDesktopApp).toHaveBeenCalled()
    expect(container.textContent).toContain(dict["onboarding.desktopRecovery.error.actionFailed"])
  })
})
