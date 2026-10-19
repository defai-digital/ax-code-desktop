import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"
import { LocalModelsProvider } from "./LocalModelsProvider"
import { LocalModelsPage } from "./LocalModelsPage"

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock("@/components/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/ui")>()),
  toast: toastMock,
}))

const eligibility = { supported: true, platform: "darwin", arch: "arm64", chip: "Apple M3", blockers: [], warnings: [] }

const models = (dependency: Record<string, unknown>, serverRunning = false) => ({
  eligibility,
  dependency,
  server: { running: serverRunning, ready: serverRunning, blockers: [] },
  diskRoot: { path: "/Users/dev/.cache/ax-code/ax-engine/models", freeBytes: 1e11, blockers: [] },
  models: [],
  jobs: [],
})

const staleManaged = {
  available: true,
  mode: "managed",
  binaryPath: "/Users/dev/.cache/ax-code/ax-engine/bin/7.6.0/ax-engine",
  version: "7.6.0",
  managedVersion: "7.6.0",
  pinnedVersion: "7.7.0",
  updateAvailable: true,
  installable: false,
  blockers: [],
  warnings: [
    "AX_ENGINE_VERSION_UNSUPPORTED: managed ax-engine 7.6.0 is older than the 7.7.0 release this AX Code installs; run `ax-code providers ax-engine install` to update it",
  ],
}

let container: HTMLDivElement
let root: Root
let modelsFailure: boolean
let connectionMode: "managed" | "attach"
let modelsBody: unknown
// Bodies served before falling back to modelsBody, one per models request.
let modelsQueue: unknown[]
let calls: string[]
// The models request URLs, so a test can see which directory was actually loaded.
let modelsCalls: string[]
let installResponse: () => Promise<Response>

const json = (body: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, statusText: "", json: async () => body }) as Response

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  const method = init?.method ?? "GET"
  // Only AX Engine calls; other stores may save settings in the background.
  if (method !== "GET" && url.includes("/provider/ax-engine/"))
    calls.push(`${method} ${new URL(url, "http://x").pathname}`)
  if (url.includes("/provider/ax-engine/models")) {
    modelsCalls.push(url)
    if (modelsFailure) return json({ error: "Runtime unavailable" }, 500)
    // A queued entry may be a promise, so a test can hold one directory's answer until after another
    // directory's load has run.
    const queued = modelsQueue.length ? modelsQueue.shift() : modelsBody
    return queued instanceof Promise ? queued : json(queued)
  }
  if (url.includes("/provider/ax-engine/connection"))
    return json({
      mode: connectionMode,
      baseURL: "http://127.0.0.1:31418/v1",
      ready: false,
      models: [],
      toolcall: false,
      hasApiKey: false,
    })
  if (url.includes("/provider/ax-engine/stop")) return json(true)
  if (url.includes("/provider/ax-engine/install")) return installResponse()
  if (url.endsWith("/health")) return json({ axCodeBinaryResolved: "/bundled/ax-code", axCodeVersion: "7.26.0" })
  return json({})
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
        <LocalModelsProvider>
          <LocalModelsPage />
        </LocalModelsProvider>
      </I18nProvider>,
    )
  })
  await flush()
}

const text = () => document.body.textContent ?? ""
const button = (label: string, scope: ParentNode = document.body) =>
  Array.from(scope.querySelectorAll("button")).find((entry) => entry.textContent?.trim() === label) ?? null
const dialogButton = (label: string) => {
  const dialog = document.body.querySelector('[role="dialog"]')
  return dialog ? button(label, dialog) : null
}

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  calls = []
  modelsFailure = false
  connectionMode = "managed"
  modelsCalls = []
  modelsQueue = []
  installResponse = async () => json({ installed: true, alreadyPresent: false, version: "7.7.0", binaryPath: "/x" })
  fetchMock.mockClear()
  toastMock.success.mockClear()
  toastMock.error.mockClear()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

describe("LocalModelsPage AX Engine status", () => {
  test("shows the version, source and the runtime's warning", async () => {
    modelsBody = models(staleManaged)
    await render()
    expect(text()).toContain("v7.6.0 · Installed by AX Code")
    expect(text()).toContain("managed ax-engine 7.6.0 is older than the 7.7.0 release")
    expect(text()).not.toContain("AX_ENGINE_VERSION_UNSUPPORTED")
  })

  test("updates a stopped managed engine without stopping anything", async () => {
    modelsBody = models(staleManaged)
    await render()
    await act(async () => {
      button("Update to 7.7.0")?.click()
    })
    await flush()
    expect(calls).toEqual(["POST /api/provider/ax-engine/install"])
  })

  test("asks before stopping a running server, then stops it before installing", async () => {
    modelsBody = models(staleManaged, true)
    await render()
    await act(async () => {
      button("Update to 7.7.0")?.click()
    })
    await flush()
    expect(text()).toContain("AX Engine is running. Stop it and update to 7.7.0?")
    expect(calls).toEqual([])
    await act(async () => {
      dialogButton("Confirm")?.click()
    })
    await flush()
    expect(calls).toEqual(["POST /api/provider/ax-engine/stop", "POST /api/provider/ax-engine/install"])
    expect(toastMock.success).toHaveBeenCalledWith("AX Engine updated to 7.7.0")
  })

  test("uses the server state at click time, not the last poll", async () => {
    modelsQueue = [models(staleManaged, false)]
    modelsBody = models(staleManaged, true)
    await render()
    expect(text()).toContain("Stopped")
    await act(async () => {
      button("Update to 7.7.0")?.click()
    })
    await flush()
    expect(text()).toContain("AX Engine is running. Stop it and update to 7.7.0?")
    expect(calls).toEqual([])
  })

  test("does nothing when the user declines to stop the server", async () => {
    modelsBody = models(staleManaged, true)
    await render()
    await act(async () => {
      button("Update to 7.7.0")?.click()
    })
    await flush()
    await act(async () => {
      dialogButton("Cancel")?.click()
    })
    await flush()
    expect(calls).toEqual([])
    expect(button("Update to 7.7.0")).not.toBeNull()
  })

  test("starts one install for a double click", async () => {
    modelsBody = models(staleManaged)
    let resolveInstall: (response: Response) => void = () => {}
    installResponse = () => new Promise<Response>((resolve) => (resolveInstall = resolve))
    await render()
    await act(async () => {
      const update = button("Update to 7.7.0")
      update?.click()
      update?.click()
    })
    await flush()
    expect(calls).toEqual(["POST /api/provider/ax-engine/install"])
    await act(async () => {
      resolveInstall(json({ installed: true, alreadyPresent: false, version: "7.7.0", binaryPath: "/x" }))
    })
    await flush()
  })

  test("stops a running server before installing an engine too old to count as installed", async () => {
    modelsBody = models(
      {
        available: false,
        mode: "missing",
        installable: true,
        pinnedVersion: "7.7.0",
        blockers: ["AX_ENGINE_BINARY_MISSING: ax-engine was not found."],
        warnings: [
          "AX_ENGINE_VERSION_UNSUPPORTED: managed ax-engine 7.6.0 does not establish the required 7.7.0 contract",
        ],
      },
      true,
    )
    await render()
    await act(async () => {
      button("Install")?.click()
    })
    await flush()
    expect(text()).toContain("AX Engine is running. Stop it and install AX Engine?")
    await act(async () => {
      dialogButton("Confirm")?.click()
    })
    await flush()
    expect(calls).toEqual(["POST /api/provider/ax-engine/stop", "POST /api/provider/ax-engine/install"])
  })

  test("offers no update for an engine on PATH, even when behind the pin", async () => {
    modelsBody = models({
      ...staleManaged,
      mode: "path",
      binaryPath: "/opt/homebrew/bin/ax-engine",
      updateAvailable: false,
    })
    await render()
    expect(button("Update to 7.7.0")).toBeNull()
    expect(text()).toContain("Update it the same way you installed it.")
  })

  test("drops a load that finishes after the directory changed", async () => {
    // The page's load guard only knew "something is in flight": a switch to another project was
    // swallowed by it, the previous project's answer became the final state, and every action then
    // ran against a directory the page did not show.
    const { axCodeClient } = await import("@/lib/ax-code/client")
    const { useProjectsStore } = await import("@/stores/useProjectsStore")
    const previousDirectory = axCodeClient.getDirectory()
    const previousProjectId = useProjectsStore.getState().activeProjectId

    const otherDirectoryWarning = "AX_ENGINE_VERSION_UNSUPPORTED: managed ax-engine 7.6.0 is older"
    modelsBody = models({
      available: false,
      mode: "missing",
      installable: false,
      pinnedVersion: "7.7.0",
      blockers: [],
      warnings: ["AX_ENGINE_BINARY_MISSING: ax-engine was not found."],
    })

    let releaseOther: (() => void) | undefined
    modelsQueue = [
      new Promise<Response>((resolve) => {
        releaseOther = () => resolve(json(models(staleManaged)))
      }),
    ]

    try {
      axCodeClient.setDirectory("/project-a")
      useProjectsStore.setState({ activeProjectId: "project-a" })
      await render()

      axCodeClient.setDirectory("/project-b")
      await act(async () => {
        useProjectsStore.setState({ activeProjectId: "project-b" })
      })
      await flush()

      await act(async () => {
        releaseOther?.()
        await Promise.resolve()
      })
      await flush()

      expect(text()).not.toContain(otherDirectoryWarning)
      // And the new directory was actually loaded: the in-flight guard used to swallow that request.
      expect(modelsCalls.some((url) => url.includes("project-b"))).toBe(true)
    } finally {
      axCodeClient.setDirectory(previousDirectory ?? undefined)
      useProjectsStore.setState({ activeProjectId: previousProjectId })
    }
  })

  test("cancels an install in progress", async () => {
    modelsBody = models({
      available: false,
      mode: "missing",
      installable: true,
      pinnedVersion: "7.7.0",
      blockers: ["AX_ENGINE_BINARY_MISSING: ax-engine was not found."],
      warnings: [],
    })
    installResponse = () =>
      new Promise<Response>((_, reject) => {
        const signal = fetchMock.mock.calls.at(-1)?.[1]?.signal
        signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))
      })
    await render()
    await act(async () => {
      button("Install")?.click()
    })
    await flush()
    expect(text()).toContain("Installing AX Engine…")
    await act(async () => {
      button("Cancel")?.click()
    })
    await flush()
    expect(toastMock.success).toHaveBeenCalledWith("AX Engine install cancelled")
    expect(button("Install")).not.toBeNull()
  })
})

describe("local model platform availability", () => {
  test.each([
    ["win32", "x64", "AX_ENGINE_UNSUPPORTED_PLATFORM: AX Engine requires macOS"],
    ["linux", "arm64", "AX_ENGINE_UNSUPPORTED_PLATFORM: AX Engine requires macOS"],
    ["darwin", "x64", "AX_ENGINE_UNSUPPORTED_ARCH: Apple Silicon is required"],
    ["darwin", "arm64", "AX_ENGINE_UNSUPPORTED_CHIP: Apple Silicon M2 or later is required"],
    ["darwin", "arm64", "AX_ENGINE_UNSUPPORTED_MACOS: macOS 26 or later is required"],
  ])("explains unsupported %s/%s without offering local or connection actions", async (platform, arch, reason) => {
    modelsBody = {
      ...models(staleManaged),
      eligibility: { supported: false, platform, arch, blockers: [reason], warnings: [] },
    }
    await render()
    expect(text()).toContain("Local models are unavailable on this host")
    expect(text()).toContain(reason.split(": ")[1])
    expect(text()).not.toContain("AX_ENGINE_UNSUPPORTED")
    for (const label of ["Managed local", "Existing server", "Prewarm", "Install", "Update to 7.7.0"])
      expect(button(label)).toBeNull()
    expect(document.querySelector("input")).toBeNull()
    const { useUIStore } = await import("@/stores/useUIStore")
    const before = useUIStore.getState().settingsPage
    await act(async () => button("Open Providers")?.click())
    expect(useUIStore.getState().settingsPage).toBe("providers")
    act(() => useUIStore.setState({ settingsPage: before }))
    expect(calls).toEqual([])
  })

  test("does not expose connection controls while host readiness is unknown", async () => {
    let release!: (response: Response) => void
    modelsQueue = [
      new Promise<Response>((resolve) => {
        release = resolve
      }),
    ]
    modelsBody = models(staleManaged)
    await render()
    expect(text()).not.toContain("Local models are unavailable")
    expect(button("Managed local")).toBeNull()
    expect(button("Prewarm")).toBeNull()
    await act(async () => release(json(modelsBody)))
    await flush()
    expect(button("Managed local")).not.toBeNull()
    expect(document.querySelector("details")?.open).toBe(false)
  })

  test("keeps an existing attach connection editable on an unsupported host", async () => {
    connectionMode = "attach"
    modelsBody = { ...models(staleManaged), eligibility: { ...eligibility, supported: false, platform: "linux" } }
    await render()
    expect(document.querySelector("details")?.open).toBe(true)
    expect(button("Update")).not.toBeNull()
    expect(text()).toContain("Attached endpoint unavailable")
    expect(text()).toContain("remote URLs are not supported")
    expect(button("Managed local")).toBeNull()
    expect(button("Prewarm")).toBeNull()
    expect(button("Update to 7.7.0")).toBeNull()
    expect(calls).toEqual([])
  })

  test("retains attach management even when the catalog check fails", async () => {
    connectionMode = "attach"
    modelsFailure = true
    await render()
    expect(button("Update")).not.toBeNull()
    expect(button("Refresh")).not.toBeNull()
    expect(text()).not.toContain("Local models are unavailable")
    expect(text()).toContain("Unable to check local model availability")
  })

  test("reports a failed check as retryable and recovers to the supported page", async () => {
    modelsFailure = true
    modelsBody = models(staleManaged)
    await render()
    expect(text()).toContain("Unable to check local model availability")
    expect(text()).not.toContain("Local models are unavailable")
    expect(button("Managed local")).toBeNull()
    modelsFailure = false
    await act(async () => button("Retry")?.click())
    await flush()
    expect(button("Update to 7.7.0")).not.toBeNull()
    expect(button("Retry")).toBeNull()
    expect(calls).toEqual([])
  })

  test("retains Stop for an existing local server after the host becomes unsupported", async () => {
    modelsBody = { ...models(staleManaged, true), eligibility: { ...eligibility, supported: false } }
    await render()
    expect(button("Stop")).not.toBeNull()
    expect(button("Managed local")).toBeNull()
    await act(async () => button("Stop")?.click())
    await flush()
    expect(calls).toEqual(["POST /api/provider/ax-engine/stop"])
  })
})
