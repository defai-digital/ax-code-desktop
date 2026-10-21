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
    await Promise.resolve()
    await Promise.resolve()
    expect(fetchRisk).toHaveBeenCalledTimes(3)
    expect(verificationEvidenceFor("a", "/repo", cache.getSnapshot())).toEqual({
      state: "failed",
      passed: 0,
      failed: 1,
      total: 1,
    })
    expect(JSON.stringify([...cache.getSnapshot().values()])).not.toContain("secret command output")
    expect(verificationEvidenceFor("a", "/other", cache.getSnapshot())).toBeNull()
    consumer.dispose()
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
