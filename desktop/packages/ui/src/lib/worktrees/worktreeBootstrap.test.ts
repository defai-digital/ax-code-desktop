import { beforeEach, describe, expect, test, vi } from "vitest"

import type { GitWorktreeBootstrapStatus } from "@/lib/api/types"

const bootstrapStatus = vi.fn()

vi.mock("@/lib/gitApiHttp", () => ({
  getGitWorktreeBootstrapStatus: (...args: unknown[]) => bootstrapStatus(...args),
}))

const { clearWorktreeBootstrapState, markWorktreeBootstrapPending, waitForWorktreeBootstrap } = await import(
  "./worktreeBootstrap"
)

const deferred = <T,>() => {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

const status = (value: Partial<GitWorktreeBootstrapStatus>): GitWorktreeBootstrapStatus =>
  ({ status: "pending", error: null, updatedAt: 0, ...value }) as GitWorktreeBootstrapStatus

const DIRECTORY = "/repo/.worktrees/feature"

describe("worktree bootstrap state", () => {
  beforeEach(() => {
    bootstrapStatus.mockReset()
    // A directory of its own per test: the state lives in the module.
    clearWorktreeBootstrapState(DIRECTORY)
  })

  test("a poll retired by a removal does not leave a failed state behind", async () => {
    // The poll that was in flight when the worktree was removed wrote its answer back, so the next
    // wait for that path threw the removed worktree's failure before asking the runtime anything.
    const inFlight = deferred<GitWorktreeBootstrapStatus>()
    bootstrapStatus.mockReturnValueOnce(inFlight.promise)

    markWorktreeBootstrapPending(DIRECTORY)
    const staleWait = waitForWorktreeBootstrap(DIRECTORY, 50)
    // Let the poll reach its first status request.
    await Promise.resolve()

    clearWorktreeBootstrapState(DIRECTORY)
    inFlight.resolve(status({ status: "failed", error: "setup failed" }))
    await expect(staleWait).rejects.toThrow("setup failed")

    // Nothing re-created the worktree, so the state is the removed one's unless the retired poll
    // wrote it back: the next caller is answered from that stale failure before the runtime is asked
    // anything at all.
    bootstrapStatus.mockResolvedValueOnce(status({ status: "ready" }))

    await expect(waitForWorktreeBootstrap(DIRECTORY, 50)).resolves.toBeUndefined()
  })

  test("a poll retired by a removal does not let a re-created worktree skip its wait", async () => {
    // The retired poll's "ready" was written after the clear, and the next wait — for a worktree
    // re-created at the same path, whose setup commands are still running — returned immediately.
    const inFlight = deferred<GitWorktreeBootstrapStatus>()
    bootstrapStatus.mockReturnValueOnce(inFlight.promise)

    markWorktreeBootstrapPending(DIRECTORY)
    const staleWait = waitForWorktreeBootstrap(DIRECTORY, 50)
    await Promise.resolve()

    clearWorktreeBootstrapState(DIRECTORY)
    // A new worktree takes the path while the removed one's poll is still on its way.
    markWorktreeBootstrapPending(DIRECTORY)
    inFlight.resolve(status({ status: "ready" }))
    await expect(staleWait).resolves.toBeUndefined()

    const stillRunning = deferred<GitWorktreeBootstrapStatus>()
    bootstrapStatus.mockReturnValueOnce(stillRunning.promise)

    let settled = false
    void waitForWorktreeBootstrap(DIRECTORY, 50).then(() => {
      settled = true
    })
    await Promise.resolve()
    await Promise.resolve()

    // With the stale "ready" written back over the new worktree's "pending", this returned without
    // asking the runtime anything.
    expect(settled).toBe(false)
    expect(bootstrapStatus).toHaveBeenCalledTimes(2)
  })

  test("a waiting caller is told when the poll fails", async () => {
    markWorktreeBootstrapPending(DIRECTORY)
    bootstrapStatus.mockResolvedValueOnce(status({ status: "failed", error: "setup failed" }))

    await expect(waitForWorktreeBootstrap(DIRECTORY, 50)).rejects.toThrow("setup failed")
  })
})
