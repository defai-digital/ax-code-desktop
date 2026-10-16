import { describe, expect, test, vi } from "vitest"
import { PlanSaveQueue, planContentNeedsSave, type PlanSaveQueueEntry } from "./planAutosave"

const createDeferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

describe("PlanSaveQueue disk reporting", () => {
  test("reports every write that reached the disk, not only the latest one", () => {
    // The caller records "what the disk holds" from this callback. Reporting only the latest entry left the
    // record behind whenever a save completed after the content changed again — the editor then held the older
    // text and the disk the saved one, so a revert to the older text looked like "nothing to save".
    const firstSave = createDeferred<void>()
    const saveCalls: string[] = []
    const reported: string[] = []
    const queue = new PlanSaveQueue({
      save: async (_path, content) => {
        saveCalls.push(content)
        if (saveCalls.length === 1) {
          await firstSave.promise
        }
      },
      // The editor moved on while the first write was in flight, so no entry is "the latest".
      isLatestEntry: () => false,
      onSaved: (entry) => {
        reported.push(entry.content)
      },
      onLatestSaved: () => {
        throw new Error("onLatestSaved must not fire for an entry the editor has moved past")
      },
      onLatestError: vi.fn(),
    })

    const first = queue.enqueue({ path: "/repo/plan.md", content: "older" })
    const second = queue.enqueue({ path: "/repo/plan.md", content: "newer" })
    firstSave.resolve()

    return Promise.all([first, second]).then(() => {
      expect(saveCalls).toEqual(["older", "newer"])
      expect(reported).toEqual(["older", "newer"])
    })
  })
})

describe("PlanSaveQueue", () => {
  test("serializes plan saves for the same path and coalesces queued drafts", async () => {
    const firstSave = createDeferred<void>()
    const first: PlanSaveQueueEntry = { path: "/repo/plan.md", content: "first" }
    const second: PlanSaveQueueEntry = { path: "/repo/plan.md", content: "second" }
    const third: PlanSaveQueueEntry = { path: "/repo/plan.md", content: "third" }
    const latest = { current: first }
    const saveCalls: PlanSaveQueueEntry[] = []
    const savedEntries: PlanSaveQueueEntry[] = []

    const queue = new PlanSaveQueue({
      save: async (path, content) => {
        saveCalls.push({ path, content })
        if (saveCalls.length === 1) {
          await firstSave.promise
        }
      },
      isLatestEntry: (entry) => entry === latest.current,
      onLatestSaved: (entry) => {
        savedEntries.push(entry)
      },
      onLatestError: vi.fn(),
    })

    const drain = queue.enqueue(first)
    latest.current = second
    queue.enqueue(second)
    latest.current = third
    queue.enqueue(third)

    expect(saveCalls.map((entry) => entry.content)).toEqual(["first"])
    expect(queue.hasPending("/repo/plan.md")).toBe(true)

    firstSave.resolve()
    await drain

    expect(saveCalls.map((entry) => entry.content)).toEqual(["first", "third"])
    expect(savedEntries).toEqual([third])
    expect(queue.hasPending("/repo/plan.md")).toBe(false)
  })

  test("suppresses stale write errors when a newer draft is queued", async () => {
    const first: PlanSaveQueueEntry = { path: "/repo/plan.md", content: "first" }
    const second: PlanSaveQueueEntry = { path: "/repo/plan.md", content: "second" }
    const latest = { current: second }
    const errors: unknown[] = []

    const queue = new PlanSaveQueue({
      save: async (_path, content) => {
        if (content === "first") {
          throw new Error("stale failure")
        }
      },
      isLatestEntry: (entry) => entry === latest.current,
      onLatestError: (_entry, error) => {
        errors.push(error)
      },
    })

    const drain = queue.enqueue(first)
    queue.enqueue(second)
    await drain

    expect(errors).toEqual([])
  })

  test("reports errors for the latest draft only", async () => {
    const latestEntry: PlanSaveQueueEntry = { path: "/repo/plan.md", content: "latest" }
    const errors: unknown[] = []

    const queue = new PlanSaveQueue({
      save: async () => {
        throw new Error("latest failure")
      },
      isLatestEntry: (entry) => entry === latestEntry,
      onLatestError: (_entry, error) => {
        errors.push(error)
      },
    })

    await queue.enqueue(latestEntry)

    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(Error)
  })
  test("drains an edit arriving between drain completion and active cleanup", async () => {
    const save = vi.fn<(path: string, content: string) => Promise<void>>(async () => {})
    const queue = new PlanSaveQueue({ save, isLatestEntry: () => true, onLatestError: vi.fn() })
    const first = queue.enqueue({ path: "/repo/plan.md", content: "first" })
    // The drain finishes in the next microtask, before its finally cleanup runs.
    await Promise.resolve()
    const second = queue.enqueue({ path: "/repo/plan.md", content: "last edit" })
    await Promise.all([first, second])
    expect(save.mock.calls).toEqual([
      ["/repo/plan.md", "first"],
      ["/repo/plan.md", "last edit"],
    ])
    expect(queue.hasPending("/repo/plan.md")).toBe(false)
  })
})

describe("planContentNeedsSave", () => {
  test("does not write back the text a load just read", () => {
    // The autosave effect fires for the load's own setContent: without this guard the file was
    // rewritten 350 ms after it was opened, over anything the agent had written meanwhile.
    expect(planContentNeedsSave("plan text", "plan text")).toBe(false)
  })

  test("treats any edit as a save", () => {
    expect(planContentNeedsSave("plan text edited", "plan text")).toBe(true)
    expect(planContentNeedsSave("", "plan text")).toBe(true)
  })

  test("treats content as an edit while no read has succeeded", () => {
    expect(planContentNeedsSave("typed before the first load", null)).toBe(true)
  })
})
