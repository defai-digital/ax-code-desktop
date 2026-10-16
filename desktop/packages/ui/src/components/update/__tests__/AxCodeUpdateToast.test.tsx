import React, { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, test, vi } from "vitest"
import { AxCodeUpdateToast } from "../AxCodeUpdateToast"

const { info, t, state } = vi.hoisted(() => ({
  info: vi.fn(),
  t: (key: string) => key,
  state: { showAxCodeUpdateNotifications: true },
}))
vi.mock("@/components/ui/toast", () => ({ toast: { info, dismiss: vi.fn() } }))
vi.mock("@/components/icon/Icon", () => ({ Icon: () => null }))
vi.mock("@/stores/useAgentsStore", () => ({ reloadAxCodeConfiguration: vi.fn() }))
vi.mock("@/stores/useUIStore", () => ({
  useUIStore: Object.assign((select: (value: typeof state) => unknown) => select(state), { getState: () => state }),
}))
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t }) }))
vi.mock("@/stores/utils/safeStorage", () => ({ getSafeStorage: () => ({ getItem: () => null }) }))

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

test("scheduled CLI checks discover a release published after the initial check", async () => {
  vi.useFakeTimers()
  let latest = "7.25.0"
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    const body = url.includes("upgrade-status")
      ? { binarySource: "bundled" }
      : {
          installed: true,
          onPath: true,
          currentVersion: "7.25.0",
          latestVersion: url.endsWith("/cli/check") ? latest : "7.25.0",
          updateAvailable: url.endsWith("/cli/check") && latest !== "7.25.0",
          canUpgrade: true,
        }
    return { ok: true, json: async () => body } as Response
  })
  vi.stubGlobal("fetch", fetch)
  const container = document.createElement("div")
  const root = createRoot(container)
  try {
    await act(async () => root.render(<AxCodeUpdateToast />))
    await act(async () => vi.advanceTimersByTimeAsync(8_000))
    expect(info).not.toHaveBeenCalled()
    latest = "7.26.0"
    await act(async () => vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000))
    expect(info).toHaveBeenCalledWith("axCodeUpdate.cli.toast.available.title", expect.any(Object))
    expect(fetch.mock.calls.filter(([url]) => String(url).endsWith("/cli/check"))).toHaveLength(2)
  } finally {
    act(() => root.unmount())
  }
})
