import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"
import { dict } from "@/lib/i18n/messages/en"

const { desktopHostsGet, desktopHostsSet, restartDesktopApp, toastError, tauriShell } = vi.hoisted(() => ({
  desktopHostsGet: vi.fn(),
  desktopHostsSet: vi.fn(),
  restartDesktopApp: vi.fn(async () => {}),
  toastError: vi.fn(),
  tauriShell: { current: false },
}))

vi.mock("@/components/ui", () => ({
  toast: { error: toastError, success: vi.fn(), message: vi.fn(), warning: vi.fn() },
}))
vi.mock("@/lib/desktopHosts", () => ({
  desktopHostsGet,
  desktopHostsSet,
  defaultDesktopHostsConfig: { hosts: [], defaultHostId: "local", initialHostChoiceCompleted: false },
}))
vi.mock("@/lib/desktop", async () => {
  const actual = await vi.importActual<typeof import("@/lib/desktop")>("@/lib/desktop")
  return {
    ...actual,
    isTauriShell: () => tauriShell.current,
    restartDesktopApp,
  }
})
vi.mock("@/components/layout/DesktopTitlebarDragStrip", () => ({ DesktopTitlebarDragStrip: () => null }))

const { RecoveryScreen } = await import("./RecoveryScreen")

describe("RecoveryScreen actions", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    desktopHostsGet.mockReset()
    desktopHostsSet.mockReset()
    restartDesktopApp.mockClear()
    toastError.mockReset()
    tauriShell.current = false
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  const render = async (variant: React.ComponentProps<typeof RecoveryScreen>["variant"]) => {
    await act(async () => {
      root.render(
        <I18nProvider>
          <RecoveryScreen variant={variant} onRetry={vi.fn()} />
        </I18nProvider>,
      )
    })
    await act(async () => {})
  }

  const clickLabel = async (label: string) => {
    const button = Array.from(container.querySelectorAll("button")).find((element) =>
      (element.textContent ?? "").includes(label),
    )
    if (!button) throw new Error(`button not found: ${label}`)
    await act(async () => {
      button.click()
    })
    await act(async () => {})
  }

  // The whole point of the button is the write, and the write keeps its rejection for the awaiting
  // caller to report. Without this the click did nothing at all — no restart, no reload, no message.
  test("reports a local choice that could not be saved and restarts nothing", async () => {
    tauriShell.current = true
    desktopHostsGet.mockResolvedValue({ hosts: [], defaultHostId: "remote", initialHostChoiceCompleted: true })
    desktopHostsSet.mockRejectedValue(new Error("hosts write failed"))
    await render("remote-unreachable")

    await clickLabel(dict["onboarding.desktopRecovery.common.useLocal"])

    expect(desktopHostsSet).toHaveBeenCalled()
    expect(toastError).toHaveBeenCalledWith("hosts write failed")
    expect(restartDesktopApp).not.toHaveBeenCalled()
  })

  test("reports a reload that failed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("reload request failed"))))
    const onRetry = vi.fn()
    await act(async () => {
      root.render(
        <I18nProvider>
          <RecoveryScreen variant="local-unavailable" onRetry={onRetry} />
        </I18nProvider>,
      )
    })
    await act(async () => {})

    await clickLabel(dict["onboarding.desktopRecovery.localUnavailable.retry"])

    expect(toastError).toHaveBeenCalledWith("reload request failed")
    expect(onRetry).not.toHaveBeenCalled()
  })
})
