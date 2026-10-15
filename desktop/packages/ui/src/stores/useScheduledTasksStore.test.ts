import { beforeEach, describe, expect, it, vi } from "vitest"

import type { ScheduledTask } from "@/lib/scheduledTasksApi"

const { fetchScheduledTasks } = vi.hoisted(() => ({ fetchScheduledTasks: vi.fn() }))

vi.mock("@/lib/scheduledTasksApi", () => ({ fetchScheduledTasks }))

import {
  getScheduledTaskGroup,
  resetScheduledTasksStoreForTests,
  SCHEDULED_TASK_LOAD_CONCURRENCY,
  useScheduledTasksStore,
} from "./useScheduledTasksStore"

const task = (id: string, directory: string, overrides: Partial<ScheduledTask> = {}): ScheduledTask => ({
  id,
  directory,
  title: id,
  prompt: "Do it",
  schedule: { type: "daily", time: "09:00" },
  status: "active",
  catchUpPolicy: "run_once",
  lastRunStatus: "idle",
  time: { created: 1 },
  ...overrides,
})

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void }
const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const store = () => useScheduledTasksStore.getState()

beforeEach(() => {
  resetScheduledTasksStoreForTests()
  fetchScheduledTasks.mockReset()
})

describe("useScheduledTasksStore", () => {
  it("tracks directories, marks new ones loading, and loads them", async () => {
    fetchScheduledTasks.mockImplementation(async (directory: string) => [task(`t-${directory}`, directory)])
    const added = store().setTrackedDirectories(["/a/", "/b", "/a"])
    expect(added).toEqual(["/a", "/b"])
    expect(getScheduledTaskGroup("/a")).toMatchObject({ loading: true, hasLoaded: false })
    await store().loadGroups(added)
    expect(getScheduledTaskGroup("/a")).toMatchObject({ loading: false, hasLoaded: true, error: null })
    expect(getScheduledTaskGroup("/b").tasks.map((item) => item.id)).toEqual(["t-/b"])
    // Re-tracking the same set adds nothing.
    expect(store().setTrackedDirectories(["/a", "/b"])).toEqual([])
  })

  it("ignores loads for untracked directories", async () => {
    await store().loadGroup("/nowhere")
    expect(fetchScheduledTasks).not.toHaveBeenCalled()
    expect(store().groups).toEqual({})
  })

  it("applies only the latest response for a directory", async () => {
    store().setTrackedDirectories(["/a"])
    const first = deferred<ScheduledTask[]>()
    const second = deferred<ScheduledTask[]>()
    fetchScheduledTasks.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const firstLoad = store().loadGroup("/a")
    const secondLoad = store().loadGroup("/a")
    second.resolve([task("new", "/a")])
    await secondLoad
    first.resolve([task("old", "/a")])
    await firstLoad
    expect(getScheduledTaskGroup("/a").tasks.map((item) => item.id)).toEqual(["new"])
    expect(getScheduledTaskGroup("/a").loading).toBe(false)
  })

  it("drops a removed project's late response, also after it is added again", async () => {
    store().setTrackedDirectories(["/a"])
    const stale = deferred<ScheduledTask[]>()
    fetchScheduledTasks.mockReturnValueOnce(stale.promise)
    const staleLoad = store().loadGroup("/a")
    store().setTrackedDirectories([])
    expect(store().groups).toEqual({})

    store().setTrackedDirectories(["/a"])
    const fresh = deferred<ScheduledTask[]>()
    fetchScheduledTasks.mockReturnValueOnce(fresh.promise)
    const freshLoad = store().loadGroup("/a")
    stale.resolve([task("stale", "/a")])
    await staleLoad
    expect(getScheduledTaskGroup("/a").tasks).toEqual([])
    fresh.resolve([task("fresh", "/a")])
    await freshLoad
    expect(getScheduledTaskGroup("/a").tasks.map((item) => item.id)).toEqual(["fresh"])
  })

  it("keeps the last good list when a refresh fails", async () => {
    store().setTrackedDirectories(["/a"])
    fetchScheduledTasks.mockResolvedValueOnce([task("kept", "/a")])
    await store().loadGroup("/a")
    fetchScheduledTasks.mockRejectedValueOnce(new Error("runtime down"))
    await store().loadGroup("/a")
    expect(getScheduledTaskGroup("/a")).toMatchObject({ hasLoaded: true, loading: false, error: "runtime down" })
    expect(getScheduledTaskGroup("/a").tasks.map((item) => item.id)).toEqual(["kept"])
  })

  it("discards a load that started before an optimistic patch", async () => {
    store().setTrackedDirectories(["/a"])
    fetchScheduledTasks.mockResolvedValueOnce([task("t", "/a")])
    await store().loadGroup("/a")
    const inFlight = deferred<ScheduledTask[]>()
    fetchScheduledTasks.mockReturnValueOnce(inFlight.promise)
    const load = store().loadGroup("/a")
    store().patchGroupTasks("/a", (tasks) => tasks.map((item) => ({ ...item, status: "paused" })))
    inFlight.resolve([task("t", "/a", { status: "active" })])
    await load
    expect(getScheduledTaskGroup("/a").tasks[0].status).toBe("paused")
  })

  it("never runs more than the concurrency limit and skips projects removed while queued", async () => {
    const directories = ["/1", "/2", "/3", "/4", "/5"]
    store().setTrackedDirectories(directories)
    let inFlight = 0
    let maxInFlight = 0
    const pending: Array<() => void> = []
    fetchScheduledTasks.mockImplementation(
      (directory: string) =>
        new Promise<ScheduledTask[]>((resolve) => {
          inFlight += 1
          maxInFlight = Math.max(maxInFlight, inFlight)
          pending.push(() => {
            inFlight -= 1
            resolve([task(`t${directory}`, directory)])
          })
        }),
    )
    const batch = store().loadGroups(directories)
    await Promise.resolve()
    expect(fetchScheduledTasks).toHaveBeenCalledTimes(SCHEDULED_TASK_LOAD_CONCURRENCY)
    store().setTrackedDirectories(["/1", "/2", "/3", "/4"])
    while (pending.length > 0) {
      pending.shift()?.()
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    await batch
    expect(maxInFlight).toBe(SCHEDULED_TASK_LOAD_CONCURRENCY)
    expect(fetchScheduledTasks.mock.calls.map(([directory]) => directory)).toEqual(["/1", "/2", "/3", "/4"])
    expect(store().groups["/5"]).toBeUndefined()
  })
})
