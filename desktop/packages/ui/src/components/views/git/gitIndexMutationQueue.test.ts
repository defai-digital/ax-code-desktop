import { describe, expect, test } from "vitest"
import { createGitIndexMutationQueue, type GitIndexMutationDirection } from "./gitIndexMutationQueue"

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

const createDeferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const waitMicrotask = async () => {
  await Promise.resolve()
}

describe("createGitIndexMutationQueue", () => {
  test("coalesces consecutive mutations with the same directory and direction", async () => {
    const calls: Array<{ direction: GitIndexMutationDirection; paths: string[] }> = []
    const queue = createGitIndexMutationQueue({
      runMutation: async ({ direction, paths }) => {
        calls.push({ direction, paths })
      },
      onMutationComplete: () => {},
      onMutationError: () => {},
      onPathsComplete: () => {},
      scheduleFlush: () => queue.flush(),
    })

    queue.enqueue({ directory: "/repo", direction: "stage", paths: new Set(["a.ts"]) })
    queue.enqueue({ directory: "/repo", direction: "stage", paths: new Set(["b.ts", "a.ts"]) })
    queue.flush()
    await waitMicrotask()

    expect(calls).toEqual([{ direction: "stage", paths: ["a.ts", "b.ts"] }])
  })

  test("serializes mutations and preserves alternating direction order", async () => {
    const first = createDeferred<void>()
    const calls: Array<{ direction: GitIndexMutationDirection; paths: string[] }> = []
    let callCount = 0

    const queue = createGitIndexMutationQueue({
      runMutation: ({ direction, paths }) => {
        calls.push({ direction, paths })
        callCount += 1
        return callCount === 1 ? first.promise : Promise.resolve()
      },
      onMutationComplete: () => {},
      onMutationError: () => {},
      onPathsComplete: () => {},
      scheduleFlush: () => queue.flush(),
    })

    queue.enqueue({ directory: "/repo", direction: "stage", paths: new Set(["a.ts"]) })
    queue.enqueue({ directory: "/repo", direction: "unstage", paths: new Set(["a.ts"]) })
    queue.flush()
    queue.flush()
    await waitMicrotask()

    expect(calls).toEqual([{ direction: "stage", paths: ["a.ts"] }])
    expect(queue.isRunning()).toBe(true)

    first.resolve()
    await waitMicrotask()
    await waitMicrotask()

    expect(calls).toEqual([
      { direction: "stage", paths: ["a.ts"] },
      { direction: "unstage", paths: ["a.ts"] },
    ])
  })

  test("reports errors, completes paths, and continues the queue", async () => {
    const errors: unknown[] = []
    const completedPaths: string[][] = []
    const completedDirections: GitIndexMutationDirection[] = []
    let callCount = 0

    const queue = createGitIndexMutationQueue({
      runMutation: async ({ direction }) => {
        callCount += 1
        if (callCount === 1) {
          throw new Error(`${direction} failed`)
        }
      },
      onMutationComplete: ({ direction }) => {
        completedDirections.push(direction)
      },
      onMutationError: (_mutation, error) => {
        errors.push(error)
      },
      onPathsComplete: (paths) => {
        completedPaths.push(paths)
      },
      scheduleFlush: () => queue.flush(),
    })

    queue.enqueue({ directory: "/repo", direction: "stage", paths: new Set(["a.ts"]) })
    queue.enqueue({ directory: "/repo", direction: "unstage", paths: new Set(["b.ts"]) })
    queue.flush()
    await waitMicrotask()
    await waitMicrotask()

    expect(errors).toHaveLength(1)
    expect(completedDirections).toEqual(["unstage"])
    expect(completedPaths).toEqual([["a.ts"], ["b.ts"]])
  })

  test("passes rollback callbacks to error handlers", async () => {
    let rollbackCalled = false
    const queue = createGitIndexMutationQueue({
      runMutation: async () => {
        throw new Error("stage failed")
      },
      onMutationComplete: () => {},
      onMutationError: (mutation) => {
        mutation.rollback?.()
      },
      onPathsComplete: () => {},
      scheduleFlush: () => queue.flush(),
    })

    queue.enqueue({
      directory: "/repo",
      direction: "stage",
      paths: new Set(["a.ts"]),
      rollback: () => {
        rollbackCalled = true
      },
    })
    queue.flush()
    await waitMicrotask()

    expect(rollbackCalled).toBe(true)
  })
})

describe("clear", () => {
  test("rolls back queued mutations and releases their paths without running them", async () => {
    const completedPaths: string[][] = []
    const rolledBack: string[] = []
    const runCalls: string[] = []
    let block: Deferred<void> | null = createDeferred()
    const queue = createGitIndexMutationQueue({
      runMutation: async ({ paths }) => {
        runCalls.push(paths.join(","))
        await block?.promise
      },
      onMutationComplete: () => {},
      onMutationError: () => {},
      onPathsComplete: (paths) => completedPaths.push(paths),
      scheduleFlush: () => queue.flush(),
    })

    queue.enqueue({
      directory: "/repo",
      direction: "stage",
      paths: new Set(["first.ts"]),
    })
    queue.flush()
    queue.enqueue({
      directory: "/repo",
      direction: "unstage",
      paths: new Set(["queued-a.ts"]),
      rollback: () => rolledBack.push("queued-a.ts"),
    })
    queue.enqueue({
      directory: "/other",
      direction: "stage",
      paths: new Set(["queued-b.ts"]),
      rollback: () => rolledBack.push("queued-b.ts"),
    })

    // The running mutation keeps its own completion; the queued ones are
    // abandoned and unwound (a directory switch recreates the queue here).
    queue.clear()
    block?.resolve()
    block = null
    await waitMicrotask()

    expect(runCalls).toEqual(["first.ts"])
    expect(rolledBack.sort()).toEqual(["queued-a.ts", "queued-b.ts"])
    expect(completedPaths.some((paths) => paths.includes("queued-a.ts"))).toBe(true)
    expect(completedPaths.some((paths) => paths.includes("queued-b.ts"))).toBe(true)
    expect(queue.size()).toBe(0)
  })
})
