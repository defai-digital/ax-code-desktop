import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"
import * as cliStatus from "@/components/update/axCodeCliStatus"
import { AxCodeCliInstallSection } from "./AxCodeCliInstallSection"

const baseStatus = {
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
let handler: Handler
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  const result = handler(url, init)
  if (result && typeof result === "object" && "__status" in (result as Record<string, unknown>)) {
    const { __status, ...body } = result as Record<string, unknown> & { __status: number }
    return jsonResponse(body, __status)
  }
  return jsonResponse(result)
})

const flush = async () => {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

const render = async () => {
  await act(async () => {
    root.render(
      <I18nProvider>
        <AxCodeCliInstallSection />
      </I18nProvider>,
    )
  })
  await flush()
}

const runtimeStatus = { currentVersion: "7.25.8", binarySource: "bundled" }

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  fetchMock.mockClear()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const text = () => container.textContent ?? ""
const button = (label: string) =>
  Array.from(container.querySelectorAll("button")).find((entry) => entry.textContent?.includes(label)) ?? null

describe("AxCodeCliInstallSection", () => {
  test("shows the terminal CLI next to Desktop's bundled runtime", async () => {
    handler = (url) => (url.includes("upgrade-status") ? runtimeStatus : baseStatus)
    await render()
    expect(text()).toContain("/Users/dev/.ax-code/bin/ax-code")
    expect(text()).toContain("7.25.0")
    expect(text()).toContain("Version 7.26.0 available")
    expect(text()).toContain("built-in AX Code 7.25.8")
    expect(button("Update to 7.26.0")).not.toBeNull()
  })

  test("checks again when reopening settings after the cached result expires", async () => {
    handler = (url) => {
      if (url.includes("upgrade-status")) return runtimeStatus
      return url.endsWith("/cli/status")
        ? { ...baseStatus, updateAvailable: false, latestVersion: "7.25.0" }
        : baseStatus
    }
    await render()
    expect(text()).toContain("Version 7.26.0 available")
    const check = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/cli/check"))
    expect(JSON.parse(String(check?.[1]?.body))).toEqual({ refresh: false })
  })

  test("re-checks with a POST", async () => {
    handler = (url) => (url.includes("upgrade-status") ? runtimeStatus : { ...baseStatus, updateAvailable: false })
    await render()
    expect(text()).toContain("Up to date")
    expect(button("Update to")).toBeNull()
    await act(async () => {
      button("Check now")?.click()
    })
    await flush()
    const checkCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/ax-code/cli/check"))
    expect(checkCall?.[1]?.method).toBe("POST")
  })

  test("starts an upgrade and shows the result once it settles", async () => {
    let state: "idle" | "running" | "done" = "idle"
    handler = (url, init) => {
      if (url.includes("upgrade-status")) return runtimeStatus
      if (url.endsWith("/cli/upgrade") && init?.method === "POST") {
        state = "running"
        return { __status: 202, accepted: true, upgrade: { state: "running", targetVersion: "7.26.0" } }
      }
      if (state === "running") {
        state = "done"
        return { ...baseStatus, upgrade: { state: "running" } }
      }
      if (state === "done") {
        return {
          ...baseStatus,
          currentVersion: "7.26.0",
          updateAvailable: false,
          upgrade: {
            state: "succeeded",
            previousVersion: "7.25.0",
            version: "7.26.0",
            shadowedBy: null,
            finishedAt: new Date().toISOString(),
          },
        }
      }
      return baseStatus
    }
    await render()
    vi.useFakeTimers()
    await act(async () => {
      button("Update to 7.26.0")?.click()
    })
    expect(text()).toContain("Updating…")
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_500)
    })
    vi.useRealTimers()
    await flush()
    expect(text()).toContain("Updated to 7.26.0.")
    expect(text()).toContain("Up to date")
  })

  test("explains why a Homebrew CLI that Desktop runs is not updated in place", async () => {
    handler = (url) =>
      url.includes("upgrade-status")
        ? { currentVersion: "7.25.0", binarySource: "path" }
        : {
            ...baseStatus,
            method: "brew",
            isRuntimeBinary: true,
            canUpgrade: false,
            blockedReason: "runtime-in-use",
            manualCommand: "brew upgrade ax-code",
          }
    await render()
    expect(text()).toContain("AX Code Desktop also runs this command.")
    expect(text()).toContain("Quit AX Code Desktop, then run: brew upgrade ax-code")
    expect(button("Update to")).toBeNull()
  })

  test("asks the server for a first check when it has none cached", async () => {
    handler = (url, init) => {
      if (url.includes("upgrade-status")) return runtimeStatus
      if (url.endsWith("/cli/status")) return { checked: false }
      if (url.endsWith("/cli/check") && init?.method === "POST") return baseStatus
      return null
    }
    await render()
    const check = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/cli/check"))
    expect(JSON.parse(String(check?.[1]?.body))).toEqual({ refresh: false })
    expect(text()).toContain("Version 7.26.0 available")
  })

  test("marks an install the terminal does not run", async () => {
    handler = (url) => (url.includes("upgrade-status") ? runtimeStatus : { ...baseStatus, onPath: false })
    await render()
    expect(text()).toContain("Not on your shell's PATH")
  })

  test("hides an old upgrade outcome it did not see run", async () => {
    handler = (url) =>
      url.includes("upgrade-status")
        ? runtimeStatus
        : {
            ...baseStatus,
            updateAvailable: false,
            upgrade: { state: "succeeded", version: "7.26.0", finishedAt: "2026-01-01T00:00:00.000Z" },
          }
    await render()
    expect(text()).not.toContain("Updated to 7.26.0.")
  })

  test("warns when the upgrade finished but Desktop's runtime did not restart on it", async () => {
    handler = (url) =>
      url.includes("upgrade-status")
        ? runtimeStatus
        : {
            ...baseStatus,
            currentVersion: "7.26.0",
            updateAvailable: false,
            upgrade: {
              state: "succeeded",
              version: "7.26.0",
              runtimeRestartFailed: true,
              finishedAt: new Date().toISOString(),
            },
          }
    await render()
    expect(text()).toContain("couldn't restart its runtime on it. Reload AX Code")
  })

  test("resumes polling when a fallback request finds the upgrade still running", async () => {
    const wait = cliStatus.waitForAxCodeCliUpgrade
    const poll = vi.spyOn(cliStatus, "waitForAxCodeCliUpgrade")
      .mockResolvedValueOnce(null)
      .mockImplementationOnce((options) => wait({ ...options, intervalMs: 1 }))
    let reads = 0
    handler = (url) => {
      if (url.includes("upgrade-status")) return runtimeStatus
      if (url.endsWith("/cli/status")) reads += 1
      return reads < 2
        ? { ...baseStatus, upgrade: { state: "running" } }
        : { ...baseStatus, currentVersion: "7.26.0", updateAvailable: false,
            upgrade: { state: "succeeded", version: "7.26.0" } }
    }
    await render()
    expect(poll).toHaveBeenCalledTimes(2)
    expect(text()).toContain("Updated to 7.26.0.")
    expect(button("Check now")?.disabled).toBe(false)
  })

  test("reports a missing CLI", async () => {
    handler = (url) =>
      url.includes("upgrade-status")
        ? runtimeStatus
        : { ...baseStatus, installed: false, path: null, currentVersion: null, latestVersion: null, updateAvailable: null }
    await render()
    expect(text()).toContain("No ax-code command was found")
  })
})
