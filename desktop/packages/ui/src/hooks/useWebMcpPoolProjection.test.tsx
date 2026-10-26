import { nativeWebMcpTool } from "@/test/webMcpCatalog"
import React from "react"
import { act } from "react"
import { afterEach, expect, test, vi } from "vitest"
import { cleanup, render } from "@/test/dom"
import { readWebMcpCatalog, useWebMcpBrowserStore } from "@/stores/useWebMcpBrowserStore"
import { viewKeyFor } from "@/lib/webMcpViewKey"
import { useWebMcpPoolProjection } from "./useWebMcpPoolProjection"
import { useActivityFeedRecorder } from "./useActivityFeedRecorder"

const { invoke, pause, resume } = vi.hoisted(() => ({
  invoke: vi.fn(),
  pause: vi.fn(async () => ["webmcp"]),
  resume: vi.fn(async () => {}),
}))
vi.mock("@/stores/useWebMcpBrowserStore", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/stores/useWebMcpBrowserStore")>()
  return { ...original, readWebMcpCatalog: vi.fn(original.readWebMcpCatalog) }
})
vi.mock("@/lib/desktop", () => ({ isElectronShell: () => true }))
vi.mock("@/lib/desktopBridge", () => ({ getDesktopBridge: () => ({ invoke }) }))
vi.mock("@/lib/webMcpBridgeCoordination", () => ({
  pauseChromeBridgeForProjectBrowser: pause,
  resumeChromeBridgeForProjectBrowser: resume,
}))
// The recorder only needs browser transitions here. Its full row/session modules initialize
// directory settings asynchronously, whose persistence timers do not belong to this hook.
vi.mock("./useSupervisionRows", () => ({ useSupervisionRows: () => [] }))
vi.mock("@/sync/session-ui-store", () => ({
  useSessionUIStore: (selector: (state: { currentSessionId: null }) => unknown) => selector({ currentSessionId: null }),
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
  const polls = invoke.mock.calls.length
  cleanup()
  expect(vi.getTimerCount()).toBe(0)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000)
  })
  expect(invoke).toHaveBeenCalledTimes(polls)
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

test("an identical poll does not publish a new state object or renormalize the catalog", async () => {
  vi.useFakeTimers()
  const tool = { name: "echo", description: "Echo", inputSchema: { type: "object" } }
  const otherWindows = [{ id: "foreign", pageCount: 1 }]
  invoke.mockImplementation(async () => ({
    views: [{ ...native("first", "ses_first"), catalog: [tool], generation: "gen-1" }],
    liveViews: 1,
    maxLiveViews: 4,
    otherWindows: otherWindows.map((entry) => ({ ...entry })),
  }))
  render(<Harness />)
  await act(async () => {})
  const before = useWebMcpBrowserStore.getState()
  const normalizations = vi.mocked(readWebMcpCatalog).mock.calls.length
  expect(normalizations).toBeGreaterThan(0)
  const writes = vi.fn()
  const unsubscribe = useWebMcpBrowserStore.subscribe(writes)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000)
  })
  expect(useWebMcpBrowserStore.getState()).toBe(before)
  expect(writes).not.toHaveBeenCalled()
  expect(before.capacity).toEqual({ liveViews: 1, maxLiveViews: 4, otherWindows })
  expect(vi.mocked(readWebMcpCatalog).mock.calls.length).toBe(normalizations)
  unsubscribe()
})

test("a catalog rewritten by the pane is repaired by the next poll even when the native payload is unchanged", async () => {
  vi.useFakeTimers()
  const key = viewKeyFor("/repo", "ses_first")
  const tool = { name: "echo", description: "Echo", inputSchema: { type: "object" } }
  invoke.mockImplementation(async () => ({
    views: [{ ...native("first", "ses_first"), catalog: [tool], generation: "gen-1" }],
    liveViews: 1,
    maxLiveViews: 4,
  }))
  render(<Harness />)
  await act(async () => {})
  const polled = useWebMcpBrowserStore.getState().views[key].catalog
  expect(polled).toHaveLength(1)

  // The pane's status writer stores a different catalog for the same view.
  act(() => useWebMcpBrowserStore.getState().updateView(key, { catalog: [] }))
  expect(useWebMcpBrowserStore.getState().views[key].catalog).toHaveLength(0)

  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000)
  })
  expect(useWebMcpBrowserStore.getState().views[key].catalog).toHaveLength(1)
})

test("skips pool polls while the document is hidden and catches up when it is shown", async () => {
  vi.useFakeTimers()
  invoke.mockImplementation(async () => ({
    views: [native("first", "ses_first")],
    liveViews: 1,
    maxLiveViews: 4,
  }))
  const hidden = Object.getOwnPropertyDescriptor(document, "hidden")
  const prototype = Object.getOwnPropertyDescriptor(Document.prototype, "hidden")
  Object.defineProperty(document, "hidden", { configurable: true, get: () => false })
  try {
    render(<Harness />)
    await act(async () => {})
    const calls = invoke.mock.calls.length
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(invoke.mock.calls.length).toBe(calls)
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false })
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"))
    })
    expect(invoke.mock.calls.length).toBe(calls + 1)
  } finally {
    if (hidden) Object.defineProperty(document, "hidden", hidden)
    else if (prototype) Object.defineProperty(document, "hidden", prototype)
    else delete (document as { hidden?: boolean }).hidden
  }
})

test("pool polls leave a starting or busy view untouched", async () => {
  vi.useFakeTimers()
  const key = viewKeyFor("/repo", "ses_first")
  useWebMcpBrowserStore.getState().selectView("/repo", "ses_first")
  useWebMcpBrowserStore.getState().updateView(key, {
    phase: "starting",
    busy: true,
    browserId: "local",
    enabled: false,
  })
  invoke.mockImplementation(async () => ({
    views: [{ ...native("first", "ses_first"), enabled: true, tools: 9 }],
    liveViews: 1,
    maxLiveViews: 2,
  }))
  render(<Harness />)
  await act(async () => {})
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000)
  })
  expect(useWebMcpBrowserStore.getState().views[key]).toMatchObject({
    phase: "starting",
    busy: true,
    enabled: false,
    tools: 0,
    browserId: "local",
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


test("a missing native view stays owned by a busy command until the command completes", async () => {
  vi.useFakeTimers()
  const key = viewKeyFor("/repo", "ses_first")
  useWebMcpBrowserStore.getState().updateView(key, {
    directory: "/repo",
    sessionID: "ses_first",
    phase: "ready",
    browserId: "in-flight",
    enabled: true,
    busy: true,
  })
  invoke.mockResolvedValue({ views: [] })
  render(<Harness />)
  await act(async () => {})
  expect(useWebMcpBrowserStore.getState().views[key]).toMatchObject({
    browserId: "in-flight",
    enabled: true,
    busy: true,
  })
  expect(resume).not.toHaveBeenCalled()

  act(() => useWebMcpBrowserStore.getState().updateView(key, { busy: false }))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000)
  })
  expect(useWebMcpBrowserStore.getState().views[key]).toBeUndefined()
  expect(resume).toHaveBeenCalledWith("/repo")
})

test("a command started during an outstanding pool poll keeps ownership of its missing view", async () => {
  vi.useFakeTimers()
  const key = viewKeyFor("/repo", "ses_first")
  useWebMcpBrowserStore.getState().updateView(key, {
    directory: "/repo",
    sessionID: "ses_first",
    phase: "ready",
    browserId: "pending-command",
    enabled: true,
  })
  let resolvePoll!: (value: unknown) => void
  invoke.mockImplementationOnce(() => new Promise((resolve) => { resolvePoll = resolve }))
  render(<Harness />)
  await act(async () => {})
  await act(async () => {
    useWebMcpBrowserStore.getState().updateView(key, { busy: true })
    resolvePoll({ views: [] })
  })
  expect(useWebMcpBrowserStore.getState().views[key]).toMatchObject({
    browserId: "pending-command",
    enabled: true,
    busy: true,
  })
  expect(resume).not.toHaveBeenCalled()
})
