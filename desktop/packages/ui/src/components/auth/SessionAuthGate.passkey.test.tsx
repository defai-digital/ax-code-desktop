import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"
import { dict } from "@/lib/i18n/messages/en"

const { registerCurrentDevicePasskey, cancelPasskeyCeremony } = vi.hoisted(() => ({
  registerCurrentDevicePasskey: vi.fn(),
  cancelPasskeyCeremony: vi.fn(),
}))

vi.mock("@simplewebauthn/browser", () => ({ browserSupportsWebAuthn: () => true }))
vi.mock("@/lib/passkeys", () => ({
  registerCurrentDevicePasskey,
  cancelPasskeyCeremony,
  authenticateWithPasskey: vi.fn(),
  fetchPasskeyStatus: vi.fn(async () => ({ enabled: true, hasPasskeys: false })),
  defaultPasskeyStatus: { enabled: false, hasPasskeys: false },
  isPasskeyCeremonyAbort: (error: unknown) => (error as { name?: string } | null)?.name === "AbortError",
}))
vi.mock("@/lib/persistence", () => ({ syncDesktopSettings: vi.fn(async () => {}), initializeAppearancePreferences: vi.fn(async () => {}) }))
vi.mock("@/lib/directoryPersistence", () => ({ applyPersistedDirectoryPreferences: vi.fn(async () => {}) }))
vi.mock("@/components/ui", () => ({ toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() } }))

const { SessionAuthGate } = await import("./SessionAuthGate")

describe("SessionAuthGate passkey setup", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    registerCurrentDevicePasskey.mockReset()
    cancelPasskeyCeremony.mockReset()
    window.localStorage.clear()
    // The gate offers passkey setup only in a secure context; jsdom does not provide one.
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true })

    // Locked screen: the session check answers 401, the password POST answers 200.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const status = init?.method === "POST" ? 200 : 401
        return new Response(JSON.stringify({}), { status, headers: { "Content-Type": "application/json" } })
      }),
    )
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  const render = async () => {
    await act(async () => {
      root.render(
        <I18nProvider>
          <SessionAuthGate>{null}</SessionAuthGate>
        </I18nProvider>,
      )
    })
    await act(async () => {})
  }

  const buttonByText = (label: string) =>
    Array.from(container.querySelectorAll("button")).find((button) => button.textContent === label)

  const typePassword = async (value: string) => {
    const input = container.querySelector<HTMLInputElement>('input[type="password"]')
    if (!input) throw new Error("password input not found")
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
    await act(async () => {
      setter?.call(input, value)
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
  }

  // The register ceremony runs inside the password unlock, so the button kept its disabled state for
  // the whole OS prompt: the label said "Cancel passkey setup" while clicking it did nothing, and the
  // cancel branch was short-circuited by the same flag.
  test("can cancel the passkey ceremony while the unlock is still submitting", async () => {
    registerCurrentDevicePasskey.mockImplementation(() => new Promise(() => {}))
    await render()

    await typePassword("hunter2")
    await act(async () => {
      buttonByText(dict["sessionAuth.actions.addPasskey"])?.click()
    })
    await act(async () => {})

    const cancelButton = buttonByText(dict["sessionAuth.actions.cancelPasskeySetup"])
    expect(cancelButton).toBeDefined()
    expect(cancelButton?.disabled).toBe(false)

    await act(async () => {
      cancelButton?.click()
    })

    expect(cancelPasskeyCeremony).toHaveBeenCalledTimes(1)
  })
})
