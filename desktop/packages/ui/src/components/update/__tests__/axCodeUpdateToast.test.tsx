import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"
import { useUIStore } from "@/stores/useUIStore"
import { AxCodeUpdateToast } from "../AxCodeUpdateToast"

const toastSpies = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  success: vi.fn(),
  message: vi.fn(),
  dismiss: vi.fn(),
}))

vi.mock("@/components/ui/toast", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/ui/toast")>()
  return { ...actual, toast: { ...actual.toast, ...toastSpies } }
})

interface ToastOptions {
  id?: string
  action?: { onClick: () => void }
}

/** The options of the last `toast.info` call carrying this id. */
const findToast = (id: string): ToastOptions | undefined =>
  toastSpies.info.mock.calls
    .map((call) => call[1] as ToastOptions | undefined)
    .filter((options): options is ToastOptions => options?.id === id)
    .at(-1)

const cliStatus = {
  installed: true,
  path: "/Users/dev/.ax-code/bin/ax-code",
  onPath: true,
  otherPaths: [] as string[],
  isRuntimeBinary: false,
  currentVersion: "7.25.0",
  latestVersion: "7.26.0",
  updateAvailable: true,
  method: "curl",
  checkSupported: true,
  canUpgrade: true,
  manualCommand: "ax-code upgrade",
  blockedReason: null,
  error: null,
  checkedAt: "2026-10-15T00:00:00.000Z",
  upgrade: null as null | Record<string, unknown>,
}

type Handler = (url: string, init?: RequestInit) => unknown

const jsonResponse = (body: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, statusText: "", json: async () => body }) as Response

let container: HTMLDivElement
let root: Root
let mounted: boolean
let handler: Handler
let statusCalls = 0

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  // The toast reads the CLI status through either route (a cached read or a
  // check that honours the server's cache expiry).
  if (url.endsWith("/cli/status") || url.endsWith("/cli/check")) statusCalls += 1
  const result = handler(url, init)
  if (result && typeof result === "object" && "__status" in (result as Record<string, unknown>)) {
    const { __status, ...body } = result as Record<string, unknown> & { __status: number }
    return jsonResponse(body, __status)
  }
  return jsonResponse(result)
})

const render = async () => {
  await act(async () => {
    root.render(
      <I18nProvider>
        <AxCodeUpdateToast />
      </I18nProvider>,
    )
  })
}

const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

const dispatchUpdateAvailable = async (version: string) => {
  await act(async () => {
    window.dispatchEvent(new CustomEvent("openchamber:ax-code-update-available", { detail: { version } }))
  })
}

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  mounted = true
  statusCalls = 0
  fetchMock.mockClear()
  for (const spy of Object.values(toastSpies)) spy.mockClear()
  useUIStore.setState({ showAxCodeUpdateNotifications: true })
  vi.stubGlobal("fetch", fetchMock)
  // The component arms its checks with timers, so they must be fake before the
  // first render for them to be advanceable.
  vi.useFakeTimers()
})

afterEach(() => {
  if (mounted) act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("AxCodeUpdateToast", () => {
  test("stops following an upgrade once it unmounts", async () => {
    // The upgrade keeps running on the server after the toast is gone, so the
    // follow loop has to be cancelled rather than poll (and report) forever.
    let upgrading = false
    handler = (url, init) => {
      if (url.includes("upgrade-status")) return { binarySource: "path" }
      if (url.endsWith("/cli/upgrade") && init?.method === "POST") {
        upgrading = true
        return { __status: 202, accepted: true, upgrade: { state: "running", targetVersion: "7.26.0" } }
      }
      return upgrading ? { ...cliStatus, upgrade: { state: "running" } } : cliStatus
    }
    await render()
    await advance(9_000)

    const offer = findToast("ax-code-cli-update-available")
    expect(offer?.action).toBeTruthy()

    await act(async () => {
      offer?.action?.onClick()
    })
    await advance(4_000)
    expect(statusCalls).toBeGreaterThan(1)

    act(() => root.unmount())
    mounted = false
    const beforeUnmount = statusCalls
    await advance(60_000)

    expect(statusCalls).toBe(beforeUnmount)
    expect(toastSpies.error).not.toHaveBeenCalled()
  })

  test("leaves the update to the CLI toast when it covers the same binary", async () => {
    handler = (url) =>
      url.includes("upgrade-status") ? { binarySource: "path" } : { ...cliStatus, isRuntimeBinary: true }
    await render()
    await advance(9_000)
    expect(statusCalls).toBeGreaterThan(0)
    expect(findToast("ax-code-cli-update-available")).toBeTruthy()

    toastSpies.info.mockClear()
    await dispatchUpdateAvailable("7.26.0")

    expect(findToast("ax-code-update-available")).toBeUndefined()
  })

  test("announces a runtime update the CLI toast cannot cover", async () => {
    // Desktop runs its own CLI, but that install is not the one the terminal
    // runs, so it gets no CLI toast: the update still has to be announced.
    handler = (url) =>
      url.includes("upgrade-status") ? { binarySource: "path" } : { ...cliStatus, isRuntimeBinary: true, onPath: false }
    await render()
    await advance(9_000)
    expect(statusCalls).toBeGreaterThan(0)
    expect(findToast("ax-code-cli-update-available")).toBeUndefined()

    await dispatchUpdateAvailable("7.26.0")

    expect(findToast("ax-code-update-available")).toBeTruthy()
  })
})
