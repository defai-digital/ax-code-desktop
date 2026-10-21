import { nativeWebMcpTool } from "@/test/webMcpCatalog"
import React from "react"
import { act } from "react"
import { afterEach, expect, test, vi } from "vitest"
import { cleanup, render } from "@/test/dom"
import { useWebMcpBrowserStore } from "@/stores/useWebMcpBrowserStore"
import { viewKeyFor } from "@/lib/webMcpViewKey"
import { useWebMcpPoolProjection } from "./useWebMcpPoolProjection"

const { invoke, pause, resume } = vi.hoisted(() => ({
  invoke: vi.fn(),
  pause: vi.fn(async () => ["webmcp"]),
  resume: vi.fn(async () => {}),
}))
vi.mock("@/lib/desktop", () => ({ isElectronShell: () => true }))
vi.mock("@/lib/desktopBridge", () => ({ getDesktopBridge: () => ({ invoke }) }))
vi.mock("@/lib/webMcpBridgeCoordination", () => ({
  pauseChromeBridgeForProjectBrowser: pause,
  resumeChromeBridgeForProjectBrowser: resume,
}))
const initial = useWebMcpBrowserStore.getState()
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
  useWebMcpBrowserStore.setState(initial, true)
})
function Harness() {
  useWebMcpPoolProjection()
  return null
}
const native = (id: string, sessionID: string) => ({
  id,
  directory: "/repo",
  sessionID,
  nativeAvailable: true,
  enabled: true,
  origin: `https://${id}.test`,
  paused: false,
  visible: id === "second",
  waiting: id === "first",
  tools: 0,
  page: "ready",
  error: null,
})

test("projects hidden snapshots and retains bridge exclusion until the last project session revokes", async () => {
  vi.useFakeTimers()
  let views = [native("first", "ses_first"), native("second", "ses_second")]
  invoke.mockImplementation(async () => ({ views }))
  render(<Harness />)
  await act(async () => {})
  const first = viewKeyFor("/repo", "ses_first")
  const second = viewKeyFor("/repo", "ses_second")
  expect(useWebMcpBrowserStore.getState().views[first]).toMatchObject({ waiting: true, visible: false, enabled: true })
  expect(pause).toHaveBeenCalledTimes(1)
  views = [{ ...views[0], enabled: false }, views[1]]
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000)
  })
  expect(useWebMcpBrowserStore.getState().views[second]).toMatchObject({ enabled: true })
  expect(resume).not.toHaveBeenCalled()
  views = views.map((view) => ({ ...view, enabled: false }))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000)
  })
  expect(resume).toHaveBeenCalledTimes(1)
  expect(resume).toHaveBeenCalledWith("/repo")
  const timers = vi.getTimerCount()
  await act(async () => {
    for (let i = 0; i < 200; i++)
      useWebMcpBrowserStore.getState().selectView("/repo", i % 2 ? "ses_first" : "ses_second")
  })
  expect(vi.getTimerCount()).toBe(timers)
  cleanup()
  expect(vi.getTimerCount()).toBe(0)
})

test("an old main without list leaves the pane projection intact", async () => {
  vi.useFakeTimers()
  invoke.mockRejectedValue(new Error("unavailable"))
  useWebMcpBrowserStore.getState().selectView("/repo", "ses_first")
  useWebMcpBrowserStore.getState().updateSnapshot({ phase: "ready", browserId: "legacy" })
  render(<Harness />)
  await act(async () => {})
  expect(useWebMcpBrowserStore.getState().browserId).toBe("legacy")
})

test("unchanged polls preserve snapshots and do not render the activity recorder", async () => {
  const { useActivityFeedRecorder } = await import("./useActivityFeedRecorder")
  vi.useFakeTimers()
  let views = [
    {
      ...native("first", "ses_first"),
      catalog: [{ name: "tool", description: "test", inputSchema: { type: "object" } }],
    },
  ]
  invoke.mockImplementation(async () => ({ views: structuredClone(views) }))
  let renders = 0
  function Recorder() {
    renders += 1
    useActivityFeedRecorder()
    return null
  }
  render(
    <>
      <Harness />
      <Recorder />
    </>,
  )
  await act(async () => {})
  const before = useWebMcpBrowserStore.getState().views
  const count = renders
  const writes = vi.fn()
  const unsubscribe = useWebMcpBrowserStore.subscribe(writes)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000)
  })
  expect(useWebMcpBrowserStore.getState().views).toBe(before)
  expect(writes).not.toHaveBeenCalled()
  expect(renders).toBe(count)
  views = [{ ...views[0], enabled: false }]
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000)
  })
  expect(renders).toBeGreaterThan(count)
  unsubscribe()
})

test("missing native views are pruned and a stale poll cannot resurrect cleared views", async () => {
  vi.useFakeTimers()
  let views = [native("first", "ses_first")]
  invoke.mockImplementation(async () => ({ views }))
  render(<Harness />)
  await act(async () => {})
  views = []
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000)
  })
  expect(useWebMcpBrowserStore.getState().views).toEqual({})
  expect(useWebMcpBrowserStore.getState().order).toEqual([])
  views = [native("first", "ses_first")]
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000)
  })
  let finish!: (value: unknown) => void
  invoke.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000)
  })
  await act(async () => {
    window.dispatchEvent(new CustomEvent("openchamber:webmcp-storage", { detail: { views, error: "storage-cleared" } }))
    finish({ views })
  })
  expect(useWebMcpBrowserStore.getState().views).toEqual({})
  expect(useWebMcpBrowserStore.getState().order).toEqual([])
})

test("polls generation, bounded catalogs and registration rejection into each pooled view", async () => {
  vi.useFakeTimers()
  const first = viewKeyFor("/repo", "ses_first")
  const second = viewKeyFor("/repo", "ses_second")
  const rejection = { code: "invalid-catalog", reason: "duplicate-name", tool: "echo" }
  let description = "Echo"
  invoke.mockImplementation(async () => ({
    views: [
      {
        ...native("first", "ses_first"),
        generation: "gen-first",
        catalog: [nativeWebMcpTool({ name: "echo", description })],
        catalogTotal: 65,
        catalogTruncation: "count",
        catalogRejection: rejection,
      },
      {
        ...native("second", "ses_second"),
        generation: "gen-second",
        catalog: [{ name: "other", description: "Other" }],
        catalogTotal: 1,
        catalogTruncation: null,
        catalogRejection: null,
      },
    ],
  }))
  useWebMcpBrowserStore.getState().selectView("/repo", "ses_second")
  render(<Harness />)
  await act(async () => {})
  expect(useWebMcpBrowserStore.getState().views[first]).toMatchObject({
    generation: "gen-first",
    catalogLimit: { total: 65, shown: 1, truncation: "count" },
    catalogRejection: rejection,
    registration: [{ kind: "added", name: "echo" }],
  })
  const untouched = useWebMcpBrowserStore.getState().views[second]
  description = "Changed while hidden"
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000)
  })
  expect(useWebMcpBrowserStore.getState().views[first].registration.some((event) => event.kind === "changed")).toBe(
    true,
  )
  expect(useWebMcpBrowserStore.getState().views[second]).toBe(untouched)
  expect(useWebMcpBrowserStore.getState()).toMatchObject({
    generation: "gen-second",
    catalogLimit: { total: 1, shown: 1, truncation: null },
    catalogRejection: null,
  })
})

test("projects interrupted access and foreign owner recovery while retaining bridge exclusion", async () => {
  vi.useFakeTimers()
  let view = { ...native("first", "ses_first"), waiting: false, interrupted: false }
  const otherWindows = [{ id: "foreign", pageCount: 2 }]
  invoke.mockImplementation(async () => ({ views: [view], liveViews: 3, maxLiveViews: 3, otherWindows }))
  render(<Harness />)
  await act(async () => {})
  expect(pause).toHaveBeenCalledOnce()
  expect(useWebMcpBrowserStore.getState().capacity?.otherWindows).toEqual(otherWindows)
  view = { ...view, enabled: false, interrupted: true }
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000)
  })
  expect(useWebMcpBrowserStore.getState().views[viewKeyFor("/repo", "ses_first")]).toMatchObject({
    enabled: false,
    interrupted: true,
  })
  expect(resume).not.toHaveBeenCalled()
  view = { ...view, enabled: true, interrupted: false }
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000)
  })
  expect(useWebMcpBrowserStore.getState().views[viewKeyFor("/repo", "ses_first")]).toMatchObject({
    enabled: true,
    interrupted: false,
  })
  expect(pause).toHaveBeenCalledOnce()
})
