import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useUIStore } from "@/stores/useUIStore"
import { useProjectsStore } from "@/stores/useProjectsStore"
import { axCodeClient } from "@/lib/ax-code/client"
import { SettingsView } from "./SettingsView"

let container: HTMLDivElement
let root: Root
let supported: boolean
let attached: boolean
let failed: boolean
let pending: Promise<Response> | null
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input)
  if (url.includes("/provider/ax-engine/models")) {
    if (pending) return pending
    if (failed) return json({ error: "Runtime unavailable" }, 500)
    return json({
      eligibility: { supported, platform: supported ? "darwin" : "linux", arch: "arm64", blockers: [], warnings: [] },
      dependency: { available: false, blockers: [], warnings: [] },
      server: { running: false, ready: false, blockers: [] },
      diskRoot: { path: "/cache", blockers: [] },
      models: [],
      jobs: [],
    })
  }
  if (url.includes("/provider/ax-engine/connection"))
    return json({
      mode: attached ? "attach" : "managed",
      baseURL: "http://localhost:31418/v1",
      ready: false,
      models: [],
      toolcall: false,
      hasApiKey: false,
    })
  return json({})
})
const flush = async () => {
  for (let i = 0; i < 6; i++)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
}
const render = async () => {
  await act(async () =>
    root.render(
      <I18nProvider>
        <TooltipProvider>
          <SettingsView isWindowed />
        </TooltipProvider>
      </I18nProvider>,
    ),
  )
  await flush()
}
const navButton = (label: string) =>
  [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === label)
const previous = {
  page: useUIStore.getState().settingsPage,
  open: useUIStore.getState().isSettingsDialogOpen,
  project: useProjectsStore.getState().activeProjectId,
  directory: axCodeClient.getDirectory(),
}

beforeEach(() => {
  supported = false
  attached = false
  failed = false
  pending = null
  fetchMock.mockClear()
  vi.stubGlobal("fetch", fetchMock)
  useUIStore.setState({ settingsPage: "home" })
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  useUIStore.setState({ settingsPage: previous.page, isSettingsDialogOpen: previous.open })
  useProjectsStore.setState({ activeProjectId: previous.project })
  axCodeClient.setDirectory(previous.directory ?? undefined)
  vi.unstubAllGlobals()
})

test("hides only Local Models on a confirmed unsupported runtime and keeps direct links explanatory", async () => {
  await render()
  expect(navButton("Local Models")).toBeUndefined()
  expect(navButton("Providers")).toBeDefined()
  await act(async () => useUIStore.setState({ settingsPage: "models" }))
  await flush()
  expect(container.textContent).toContain("Local models are unavailable on this host")
  expect(navButton("Open Providers")).toBeDefined()
  // Opening the page reuses the same host check rather than starting a second catalog scan.
  expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/ax-engine/models"))).toHaveLength(1)
})

test("does not probe a closed settings dialog and checks the host when it opens", async () => {
  useUIStore.setState({ isSettingsDialogOpen: false })
  await act(async () =>
    root.render(
      <I18nProvider>
        <TooltipProvider>
          <SettingsView />
        </TooltipProvider>
      </I18nProvider>,
    ),
  )
  await flush()
  expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/ax-engine/"))).toHaveLength(0)
  await act(async () => useUIStore.setState({ isSettingsDialogOpen: true }))
  await flush()
  expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/ax-engine/models"))).toHaveLength(1)
  expect(navButton("Local Models")).toBeUndefined()
})

test.each(["supported", "attached", "failed"])("keeps navigation for a %s runtime state", async (state) => {
  supported = state === "supported"
  attached = state === "attached"
  failed = state === "failed"
  await render()
  expect(navButton("Local Models")).toBeDefined()
})

test("does not classify a pending check as unsupported", async () => {
  let release!: (response: Response) => void
  pending = new Promise((resolve) => {
    release = resolve
  })
  await render()
  expect(navButton("Local Models")).toBeDefined()
  await act(async () =>
    release(
      json({
        eligibility: { supported: false },
        server: { running: false },
        models: [],
        jobs: [],
      }),
    ),
  )
  await flush()
  expect(navButton("Local Models")).toBeUndefined()
})

test("search can explain an unavailable feature without restoring its ordinary navigation entry", async () => {
  await render()
  const search = container.querySelector<HTMLInputElement>("input")!
  expect(search).not.toBeNull()
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
  await act(async () => {
    setValue.call(search, "local models")
    search.dispatchEvent(new Event("input", { bubbles: true }))
  })
  expect(navButton("Local Models")).toBeDefined()
  await act(async () => navButton("Local Models")?.click())
  await flush()
  expect(container.textContent).toContain("Local models are unavailable on this host")
  await act(async () => {
    setValue.call(search, "")
    search.dispatchEvent(new Event("input", { bubbles: true }))
  })
  expect(navButton("Local Models")).toBeUndefined()
  expect(navButton("Providers")).toBeDefined()
})

test("clears the previous host's controls immediately while a new directory is loading", async () => {
  supported = true
  useUIStore.setState({ settingsPage: "models" })
  axCodeClient.setDirectory("/supported")
  useProjectsStore.setState({ activeProjectId: "supported" })
  await render()
  expect(navButton("Managed local")).toBeDefined()
  let release!: (response: Response) => void
  pending = new Promise((resolve) => {
    release = resolve
  })
  axCodeClient.setDirectory("/pending")
  await act(async () => useProjectsStore.setState({ activeProjectId: "pending" }))
  expect(navButton("Managed local")).toBeUndefined()
  expect(container.textContent).not.toContain("Local models are unavailable")
  await act(async () =>
    release(
      json({
        eligibility: { supported: false, blockers: [] },
        dependency: { available: false, blockers: [], warnings: [] },
        diskRoot: { path: "/cache", blockers: [] },
        server: { running: false },
        models: [],
        jobs: [],
      }),
    ),
  )
  await flush()
  expect(container.textContent).toContain("Local models are unavailable on this host")
})

test("a late previous-project response cannot hide the new host's navigation", async () => {
  let release!: (response: Response) => void
  pending = new Promise((resolve) => {
    release = resolve
  })
  axCodeClient.setDirectory("/old")
  useProjectsStore.setState({ activeProjectId: "old" })
  await render()
  pending = null
  supported = true
  axCodeClient.setDirectory("/new")
  await act(async () => useProjectsStore.setState({ activeProjectId: "new" }))
  await flush()
  await act(async () =>
    release(
      json({
        eligibility: { supported: false },
        server: { running: false },
        models: [],
        jobs: [],
      }),
    ),
  )
  await flush()
  expect(navButton("Local Models")).toBeDefined()
})
