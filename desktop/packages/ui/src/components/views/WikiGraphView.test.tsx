import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { WikiMaintenanceStatus } from "@defai-digital/ax-code-sdk/v2"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { WikiLoadState } from "@/lib/wiki/snapshot"

const view = vi.hoisted(() => ({
  load: null as WikiLoadState | null,
  maintenance: null as WikiMaintenanceStatus | null,
  refreshing: false,
  requestRefresh: vi.fn(),
  invoke: vi.fn(),
}))

vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock("@/hooks/useEffectiveDirectory", () => ({ useEffectiveDirectory: () => "/project" }))
vi.mock("@/lib/desktop", () => ({ invokeDesktop: view.invoke }))
vi.mock("./wiki/useWikiGraph", () => ({
  useWikiGraph: () => ({
    load: view.load,
    maintenance: view.maintenance,
    refreshing: view.refreshing,
    requestRefresh: view.requestRefresh,
  }),
}))

import { WikiGraphView } from "./WikiGraphView"

const status = (overrides: Partial<WikiMaintenanceStatus> = {}): WikiMaintenanceStatus => ({
  phase: "ready",
  reason: "complete",
  completed: 0,
  total: 0,
  revision: 2,
  ...overrides,
})

const graph = {
  schemaVersion: 1 as const,
  snapshot: "snap-1",
  scope: "wiki-manifest" as const,
  codeRelationships: "unavailable" as const,
  nodes: [],
  edges: [],
  omitted: { nodes: 0, edges: 0 },
}

let root: Root
let container: HTMLDivElement

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.clearAllMocks()
  view.load = { status: "graph", graph }
  view.maintenance = null
  view.refreshing = false
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => {
    root.unmount()
  })
  container.remove()
})

const render = async () => {
  await act(async () => {
    root.render(<WikiGraphView />)
  })
  await act(async () => {})
}

const text = () => container.textContent ?? ""

const click = async (label: string) => {
  const target = Array.from(container.querySelectorAll("button")).find((item) => item.textContent === label)
  if (!target) throw new Error(`missing button ${label}`)
  await act(async () => {
    target.dispatchEvent(new MouseEvent("click", { bubbles: true }))
  })
  await act(async () => {})
}

describe("WikiGraphView status and failure text", () => {
  test("shows the reported disabled reason instead of the raw reason code", async () => {
    view.maintenance = status({ phase: "disabled", reason: "non_git", revision: 0 })
    await render()
    expect(text()).toContain("wiki.graph.maintenance.nonGit")
    expect(text()).not.toContain("non_git")
  })

  test("treats the unattached disabled fallback as not started, not as unavailable", async () => {
    view.maintenance = status({ phase: "disabled", reason: "disabled", revision: 0 })
    await render()
    expect(text()).toContain("wiki.graph.maintenance.disabled")
    expect(text()).not.toContain("wiki.graph.maintenance.permissions")
    expect(text()).not.toContain("wiki.graph.maintenance.nonGit")
  })

  test("shows one failure message instead of repeating the failed phase", async () => {
    view.maintenance = status({ phase: "failed", reason: "failed", revision: 0 })
    await render()
    expect(text()).toContain("wiki.graph.maintenance.failed")
    expect(text()).not.toContain("wiki.graph.phase.failed")
  })

  test("renders the viewer failure class the main process reported", async () => {
    view.invoke.mockResolvedValue({ opened: false, failure: "wiki_missing" })
    await render()
    await click("wiki.graph.openViewer")
    expect(text()).toContain("wiki.graph.viewerMissingWiki")
  })

  test("keeps an unexpected viewer result generic and never renders its text", async () => {
    view.invoke.mockResolvedValue({ opened: false, failure: "/private/project" })
    await render()
    await click("wiki.graph.openViewer")
    expect(text()).toContain("wiki.graph.viewerFailed")
    expect(text()).not.toContain("/private/project")
  })

  test("reports a disabled refresh instead of a generic refresh failure", async () => {
    const disabled = status({ phase: "disabled", reason: "permissions", revision: 0 })
    view.requestRefresh.mockResolvedValue({ status: "disabled", maintenance: disabled, reason: "permissions" })
    await render()
    await click("wiki.graph.refresh")
    expect(text()).toContain("wiki.graph.maintenance.permissions")
    expect(text()).not.toContain("wiki.graph.refreshFailed")
  })

  test("keeps the neutral message when a refresh hits the unattached fallback", async () => {
    const disabled = status({ phase: "disabled", reason: "disabled", revision: 0 })
    view.requestRefresh.mockResolvedValue({ status: "disabled", maintenance: disabled, reason: "disabled" })
    await render()
    await click("wiki.graph.refresh")
    expect(text()).toContain("wiki.graph.maintenance.disabled")
    expect(text()).not.toContain("wiki.graph.refreshFailed")
  })

  test("reports a failed refresh through the refresh failure text", async () => {
    view.requestRefresh.mockResolvedValue({ status: "failed" })
    await render()
    await click("wiki.graph.refresh")
    expect(text()).toContain("wiki.graph.refreshFailed")
  })
})
