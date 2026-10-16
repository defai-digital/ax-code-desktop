import React, { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"

const updateDesktopSettings = vi.fn()

vi.doMock("@/lib/persistence", () => ({ updateDesktopSettings }))
vi.doMock("@/lib/desktop", () => ({
  isDesktopShell: () => false,
  isTauriShell: () => false,
  startDesktopWindowDrag: () => {},
  restartDesktopApp: async () => {},
}))

const { LocalSetupScreen } = await import("./LocalSetupScreen")

describe("LocalSetupScreen custom binary path", () => {
  const roots: Array<ReturnType<typeof createRoot>> = []

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount())
    }
    updateDesktopSettings.mockReset()
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
})
