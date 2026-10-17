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

describe("SessionAuthGate", () => {
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

  const clickUnlock = async () => {
    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .filter((button) => button.getAttribute("aria-label") === dict["sessionAuth.actions.unlockAria"])
        .forEach((button) => button.click())
    })
    await act(async () => {})
  }

  const clickButtonWithText = async (label: string) => {
    await act(async () => {
      buttonByText(label)?.click()
    })
    await act(async () => {})
  }

  test("reports the failure the server answered with instead of a network screen", async () => {
    // A 500 (or any refusal that is neither a wrong password nor a rate limit) put the gate on the generic network
    // screen, whose copy tells the user to check their connection, and the message the gate had just localized for
    // this case was dropped because the screen takes no detail.
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (_url: string, init?: RequestInit) =>
          new Response(JSON.stringify({}), {
            status: init?.method === "POST" ? 500 : 401,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    )
    await render()
    await typePassword("hunter2")
    await clickUnlock()

    expect(document.body.textContent ?? "").toContain(dict["sessionAuth.error.unexpectedResponse"])
  })

  test("does not carry a failed attempt's message back to the form", async () => {
    // The locked form renders the message, and the status check that brings it back never cleared it: after a
    // failure and a retry the field showed the previous attempt's text — "check your connection" while the session
    // was simply expired.
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (_url: string, init?: RequestInit) =>
          new Response(JSON.stringify({}), {
            status: init?.method === "POST" ? 500 : 401,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    )
    await render()
    await typePassword("hunter2")
    await clickUnlock()
    expect(document.body.textContent ?? "").toContain(dict["sessionAuth.error.unexpectedResponse"])

    await clickButtonWithText(dict["sessionAuth.error.retry"])

    const passwordInput = container.querySelector<HTMLInputElement>('input[type="password"]')
    expect(passwordInput).not.toBeNull()
    expect(document.body.textContent ?? "").not.toContain(dict["sessionAuth.error.unexpectedResponse"])
  })

  test("does not show the previous failure's message when the retry fails differently", async () => {
    // The error screen renders the message as its detail, and only the `ok` and `401` branches of the status check
    // cleared it: a retry that hit a 5xx showed the previous attempt's text as the reason for a different failure.
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (_url: string, init?: RequestInit) =>
          new Response(JSON.stringify({}), {
            status: init?.method === "POST" ? 500 : 401,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    )
    await render()
    await typePassword("hunter2")
    await clickUnlock()
    expect(document.body.textContent ?? "").toContain(dict["sessionAuth.error.unexpectedResponse"])

    // Retry, with the status check itself answering a server error.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({}), { status: 500, headers: { "Content-Type": "application/json" } })),
    )
    await clickButtonWithText(dict["sessionAuth.error.retry"])

    expect(document.body.textContent ?? "").not.toContain(dict["sessionAuth.error.unexpectedResponse"])
  })

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
