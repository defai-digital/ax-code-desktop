import { describe, expect, test, vi } from "vitest"

import {
  createVerificationEvidenceCache,
  verificationEvidenceFor,
  type FetchSessionRisk,
} from "./verificationEvidenceCache"

const failedPayload = {
  envelopes: [
    {
      schemaVersion: 1,
      workflow: "qa",
      result: { passed: false, status: "failed", output: "secret command output" },
    },
  ],
}

describe("verification evidence cache", () => {
  test("reads two sessions at a time, skips a session with no directory, and stores counts only", async () => {
    type Result = Awaited<ReturnType<FetchSessionRisk>>
    const requests: Array<{ sessionID: string; resolve: (result: Result) => void }> = []
    const fetchRisk = vi.fn<FetchSessionRisk>(
      (input) =>
        new Promise((resolve) => {
          requests.push({ sessionID: input.sessionID, resolve })
        }),
    )
    const cache = createVerificationEvidenceCache(fetchRisk, { minRefetchMs: 0 })
    const consumer = cache.mount()
    consumer.update([
      { sessionId: "a", directory: "/repo", updatedAt: 2 },
      { sessionId: "b", directory: "/repo", updatedAt: 2 },
      { sessionId: "c", directory: "/repo", updatedAt: 2 },
      { sessionId: "d", directory: null, updatedAt: 2 },
    ])
    expect(fetchRisk).toHaveBeenCalledTimes(2)
    expect(requests.map((request) => request.sessionID)).toEqual(["a", "b"])
    expect(fetchRisk.mock.calls.some((call) => call[0].sessionID === "d")).toBe(false)

    requests[0]?.resolve({ data: failedPayload })
    await vi.waitFor(() => expect(fetchRisk).toHaveBeenCalledTimes(3))
    expect(verificationEvidenceFor("a", "/repo", cache.getSnapshot())).toEqual({
      state: "failed",
      passed: 0,
      failed: 1,
      total: 1,
    })
    expect(JSON.stringify([...cache.getSnapshot().values()])).not.toContain("secret command output")
    expect(verificationEvidenceFor("a", "/other", cache.getSnapshot())).toBeNull()
    consumer.dispose()
    requests.slice(1).forEach(({ resolve }) => resolve({ data: failedPayload }))
  })

  test("a failed read keeps the older result marked stale, does not advance its revision, and reads again after a backoff", async () => {
    vi.useFakeTimers()
    try {
      let clock = 0
      const fetchRisk = vi
        .fn<FetchSessionRisk>()
        .mockResolvedValueOnce({ data: failedPayload })
        .mockResolvedValueOnce({ error: { message: "down" } })
        .mockResolvedValueOnce({ data: failedPayload })
      const cache = createVerificationEvidenceCache(fetchRisk, { minRefetchMs: 0, failureBackoffMs: 1000, now: () => clock })
      const consumer = cache.mount()
      consumer.update([{ sessionId: "a", directory: "/repo", updatedAt: 1 }])
      await vi.advanceTimersByTimeAsync(0)
      expect(verificationEvidenceFor("a", "/repo", cache.getSnapshot())).toMatchObject({ failed: 1 })
      expect(verificationEvidenceFor("a", "/repo", cache.getSnapshot())?.stale).toBeUndefined()
      consumer.update([{ sessionId: "a", directory: "/repo", updatedAt: 2 }])
      await vi.advanceTimersByTimeAsync(0)
      expect(cache.getSnapshot().get("a")?.updatedAt).toBe(1)
      expect(verificationEvidenceFor("a", "/repo", cache.getSnapshot())).toMatchObject({ failed: 1, stale: true })
      expect(fetchRisk).toHaveBeenCalledTimes(2)
      clock = 1000
      await vi.advanceTimersByTimeAsync(1000)
      expect(fetchRisk).toHaveBeenCalledTimes(3)
      expect(cache.getSnapshot().get("a")?.updatedAt).toBe(2)
      expect(verificationEvidenceFor("a", "/repo", cache.getSnapshot())?.stale).toBeUndefined()
      consumer.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  test("an earlier refetch is not held back by a later backoff timer that is already armed", async () => {
    vi.useFakeTimers()
    try {
      let clock = 0
      const fetchRisk = vi.fn<FetchSessionRisk>(async (input) =>
        input.sessionID === "a" ? { error: { message: "down" } } : { data: failedPayload },
      )
      const cache = createVerificationEvidenceCache(fetchRisk, { minRefetchMs: 1000, failureBackoffMs: 5000, now: () => clock })
      const consumer = cache.mount()
      consumer.update([
        { sessionId: "a", directory: "/repo", updatedAt: 1 },
        { sessionId: "b", directory: "/repo", updatedAt: 1 },
      ])
      await vi.advanceTimersByTimeAsync(0)
      expect(fetchRisk).toHaveBeenCalledTimes(2)

      // A's failure arms a 5 s backoff first; B's newer revision is due after its 1 s minimum.
      clock = 10
      consumer.update([
        { sessionId: "a", directory: "/repo", updatedAt: 1 },
        { sessionId: "b", directory: "/repo", updatedAt: 2 },
      ])
      clock = 1000
      await vi.advanceTimersByTimeAsync(990)
      expect(fetchRisk.mock.calls.filter((call) => call[0].sessionID === "b")).toHaveLength(2)
      consumer.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  test("a read for a directory the session left cannot replace current verification", async () => {
    type Result = Awaited<ReturnType<FetchSessionRisk>>
    let resolveOld!: (value: Result) => void
    const old = new Promise<Result>((resolve) => {
      resolveOld = resolve
    })
    const fetchRisk = vi.fn<FetchSessionRisk>(({ directory }) =>
      directory === "/old" ? old : Promise.resolve({ data: failedPayload }),
    )
    const cache = createVerificationEvidenceCache(fetchRisk, { minRefetchMs: 0 })
    const consumer = cache.mount()
    const current = { sessionId: "a", directory: "/current", updatedAt: 1 }
    consumer.update([current])
    await vi.waitFor(() => expect(cache.getSnapshot().get("a")?.checks?.state).toBe("failed"))

    consumer.update([{ ...current, directory: "/old", updatedAt: 2 }])
    consumer.update([current])
    const snapshots: (string | undefined)[] = []
    const unsubscribe = cache.subscribe(() => snapshots.push(cache.getSnapshot().get("a")?.directory))
    resolveOld({ data: { envelopes: [] } })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(snapshots).not.toContain("/old")
    expect(cache.getSnapshot().get("a")).toMatchObject({ directory: "/current", checks: { state: "failed" } })
    expect(fetchRisk).toHaveBeenCalledTimes(2)
    unsubscribe()
    consumer.dispose()
  })

  test("a deadline frees a slot even when risk ignores abort and discards its late result", async () => {
    vi.useFakeTimers()
    try {
      type Result = Awaited<ReturnType<FetchSessionRisk>>
      let resolveLate!: (value: Result) => void
      const late = new Promise<Result>((resolve) => {
        resolveLate = resolve
      })
      const blocked = new Promise<Result>(() => {})
      const fetchRisk = vi.fn<FetchSessionRisk>(({ sessionID }) => {
        if (sessionID === "a") return late
        if (sessionID === "b") return blocked
        return Promise.resolve({ data: failedPayload })
      })
      const cache = createVerificationEvidenceCache(fetchRisk, { timeoutMs: 100 })
      const consumer = cache.mount()
      consumer.update(["a", "b", "c"].map((sessionId) => ({ sessionId, directory: "/repo", updatedAt: 1 })))

      await vi.advanceTimersByTimeAsync(100)
      expect(fetchRisk.mock.calls[0][0].signal.aborted).toBe(true)
      expect(fetchRisk.mock.calls.map(([input]) => input.sessionID)).toEqual(["a", "b", "c"])
      expect(verificationEvidenceFor("c", "/repo", cache.getSnapshot())?.state).toBe("failed")
      expect(cache.getSnapshot().get("a")).toMatchObject({ stale: true, checks: null })

      resolveLate({ data: failedPayload })
      await vi.advanceTimersByTimeAsync(0)
      expect(cache.getSnapshot().get("a")).toMatchObject({ stale: true, checks: null })
      consumer.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  test("a stuck read is aborted at the timeout, so no more than two requests are ever outstanding", async () => {
    vi.useFakeTimers()
    try {
      let outstanding = 0
      let peak = 0
      const fetchRisk = vi.fn<FetchSessionRisk>(
        ({ signal }) =>
          new Promise((_, reject) => {
            outstanding += 1
            peak = Math.max(peak, outstanding)
            signal.addEventListener("abort", () => {
              outstanding -= 1
              reject(new Error("aborted"))
            })
          }),
      )
      const cache = createVerificationEvidenceCache(fetchRisk, { timeoutMs: 100 })
      const consumer = cache.mount()
      consumer.update(["a", "b", "c", "d", "e", "f"].map((id) => ({ sessionId: id, directory: "/repo", updatedAt: 1 })))
      await vi.advanceTimersByTimeAsync(400)
      expect(fetchRisk.mock.calls.length).toBeGreaterThan(2)
      expect(peak).toBe(2)
      consumer.dispose()
    } finally {
      vi.useRealTimers()
    }
  })
})
