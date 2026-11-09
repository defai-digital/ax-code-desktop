import { describe, expect, test, vi } from "vitest"

import { createRemoteActivityCache } from "./remoteActivityCache"
import type { FetchActivityPage } from "./remoteActivityPreview"

describe("remote activity cache", () => {
  test("an earlier refetch is not held back by a later backoff timer that is already armed", async () => {
    vi.useFakeTimers()
    try {
      let clock = 0
      const fetchPage = vi.fn<FetchActivityPage>(async (input) =>
        input.sessionID === "a" ? { error: { message: "down" } } : { data: [] },
      )
      const cache = createRemoteActivityCache(fetchPage, { minRefetchMs: 1000, failureBackoffMs: 5000, now: () => clock })
      const consumer = cache.mount()
      consumer.update([
        { sessionId: "a", directory: "/repo", updatedAt: 1 },
        { sessionId: "b", directory: "/repo", updatedAt: 1 },
      ])
      await vi.advanceTimersByTimeAsync(0)
      expect(fetchPage).toHaveBeenCalledTimes(2)

      // A's failure arms a 5 s backoff first; B's newer revision is due after its 1 s minimum.
      clock = 10
      consumer.update([
        { sessionId: "a", directory: "/repo", updatedAt: 1 },
        { sessionId: "b", directory: "/repo", updatedAt: 2 },
      ])
      clock = 1000
      await vi.advanceTimersByTimeAsync(990)
      expect(fetchPage.mock.calls.filter((call) => call[0].sessionID === "b")).toHaveLength(2)
      consumer.dispose()
    } finally {
      vi.useRealTimers()
    }
  })
})
