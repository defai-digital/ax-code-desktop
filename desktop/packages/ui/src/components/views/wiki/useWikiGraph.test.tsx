import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { WikiMaintenanceStatus } from "@defai-digital/ax-code-sdk/v2"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const wiki = vi.hoisted(() => ({
  maintenance: vi.fn(),
  visualization: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock("@/lib/wiki/api", () => ({
  WIKI_MAINTENANCE_POLL_MS: 10,
  loadWikiMaintenance: wiki.maintenance,
  loadWikiVisualization: wiki.visualization,
  requestWikiRefresh: wiki.refresh,
}))

import { useWikiGraph } from "./useWikiGraph"

const status = (overrides: Partial<WikiMaintenanceStatus> = {}): WikiMaintenanceStatus => ({
  phase: "ready",
  reason: "complete",
  completed: 0,
  total: 0,
  revision: 4,
  ...overrides,
})

let latest: ReturnType<typeof useWikiGraph>
const Host = ({ directory }: { directory: string }) => {
  latest = useWikiGraph(directory)
  return null
}

let root: Root
let container: HTMLDivElement

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.useFakeTimers()
  vi.clearAllMocks()
  wiki.visualization.mockResolvedValue({ status: "missing" })
  wiki.maintenance.mockResolvedValue({ status: "reported", maintenance: status() })
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => {
    root.unmount()
  })
  container.remove()
  vi.useRealTimers()
})

const render = async (directory: string) => {
  await act(async () => {
    root.render(<Host directory={directory} />)
  })
  await act(async () => {})
}

const flushPoll = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(12)
  })
}

describe("useWikiGraph", () => {
  test("a late refresh from the previous project cannot move this project's revision", async () => {
    // The old project answers the poll with revision 9; a stale refresh that wrote it
    // would make the new project's first sample look unchanged and skip the refetch.
    wiki.maintenance.mockResolvedValue({ status: "reported", maintenance: status({ revision: 9 }) })
    let resolveRefresh: (value: unknown) => void = () => {}
    wiki.refresh.mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve
      }),
    )

    await render("/a")
    let pending: Promise<unknown> = Promise.resolve()
    await act(async () => {
      pending = latest.requestRefresh()
    })
    await render("/b")

    await act(async () => {
      resolveRefresh({ status: "started", maintenance: status({ phase: "running", reason: "building", revision: 9 }) })
      await pending
    })

    expect(latest.maintenance).toBeNull()
    expect(latest.refreshing).toBe(false)

    await flushPoll()
    const readsForNewProject = wiki.visualization.mock.calls.filter(([directory]) => directory === "/b")
    expect(readsForNewProject.length).toBeGreaterThanOrEqual(2)
  })

  test("keeps a disabled refresh reason and does not treat it as started", async () => {
    const disabled = status({ phase: "disabled", reason: "non_git", revision: 0 })
    wiki.refresh.mockResolvedValue({ status: "disabled", maintenance: disabled, reason: "non_git" })

    await render("/a")
    let outcome: Awaited<ReturnType<typeof latest.requestRefresh>> | undefined
    await act(async () => {
      outcome = await latest.requestRefresh()
    })

    expect(outcome).toEqual({ status: "disabled", maintenance: disabled, reason: "non_git" })
    expect(latest.maintenance).toMatchObject({ phase: "disabled", reason: "non_git" })
    expect(latest.refreshing).toBe(false)
  })

  test("a poll that started before refresh cannot overwrite the refresh status", async () => {
    let resolvePoll: (value: unknown) => void = () => {}
    wiki.maintenance.mockReturnValue(
      new Promise((resolve) => {
        resolvePoll = resolve
      }),
    )
    const refreshed = status({ phase: "running", reason: "building", revision: 8 })
    wiki.refresh.mockResolvedValue({ status: "started", maintenance: refreshed })

    await render("/a")
    await flushPoll()
    expect(wiki.maintenance).toHaveBeenCalledTimes(1)

    let outcome: Awaited<ReturnType<typeof latest.requestRefresh>> | undefined
    await act(async () => {
      outcome = await latest.requestRefresh()
    })
    expect(outcome).toEqual({ status: "started", maintenance: refreshed })
    expect(latest.maintenance).toMatchObject({ phase: "running", revision: 8 })
    const readsAfterRefresh = wiki.visualization.mock.calls.length

    await act(async () => {
      resolvePoll({ status: "reported", maintenance: status({ phase: "ready", reason: "complete", revision: 2 }) })
    })
    await act(async () => {})

    expect(latest.maintenance).toMatchObject({ phase: "running", revision: 8 })
    expect(wiki.visualization.mock.calls.length).toBe(readsAfterRefresh)
  })

  test("keeps the last status when a maintenance sample fails", async () => {
    wiki.maintenance.mockResolvedValueOnce({
      status: "reported",
      maintenance: status({ phase: "running", reason: "building", revision: 1 }),
    })
    await render("/a")
    await flushPoll()
    expect(latest.maintenance).toMatchObject({ phase: "running" })

    wiki.maintenance.mockResolvedValueOnce({ status: "failed" })
    await flushPoll()
    expect(latest.maintenance).toMatchObject({ phase: "running" })
  })
})
