import { describe, expect, test, vi } from "vitest"

import { createRemoteActivityCache } from "./remoteActivityCache"
import type { FetchActivityPage } from "./remoteActivityPreview"

describe("remote activity cache", () => {
  test("an activity adapter resolving on abort cannot publish a successful read", async () => {
    vi.useFakeTimers()
    try {
      const fetchPage = vi.fn<FetchActivityPage>(
        ({ signal }) =>
          new Promise((resolve) => {
            signal?.addEventListener("abort", () => resolve({ data: [] }), { once: true })
          }),
      )
      const cache = createRemoteActivityCache(fetchPage, { timeoutMs: 100 })
      const consumer = cache.mount()
      consumer.update([{ sessionId: "a", directory: "/repo", updatedAt: 1 }])

      await vi.advanceTimersByTimeAsync(100)
      expect(fetchPage.mock.calls[0][0].signal?.aborted).toBe(true)
      expect(cache.getSnapshot().get("a")).toMatchObject({ stale: true, preview: null })
      expect(cache.getSnapshot().get("a")?.succeededAt).toBeUndefined()
      consumer.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  test("unmounting one board cancels a queued retry even while another board stays mounted", async () => {
    vi.useFakeTimers()
    try {
      const blocked = new Promise<Awaited<ReturnType<FetchActivityPage>>>(() => {})
      const fetchPage = vi.fn<FetchActivityPage>(({ sessionID }) =>
        sessionID === "a" ? Promise.resolve({ error: "unavailable" }) : blocked,
      )
      const cache = createRemoteActivityCache(fetchPage, { timeoutMs: 100, failureBackoffMs: 1000, minRefetchMs: 0 })
      const row = (sessionId: string) => ({ sessionId, directory: "/repo", updatedAt: 1 })
      const first = cache.mount()
      const second = cache.mount()
      first.update([row("a")])
      await vi.advanceTimersByTimeAsync(0)
      second.update([row("b"), row("c")])
      cache.retry("a")
      first.dispose()
      second.update([row("b"), row("c"), row("a")])

      await vi.advanceTimersByTimeAsync(100)
      expect(fetchPage.mock.calls.map(([input]) => input.sessionID)).toEqual(["a", "b", "c"])
      await vi.advanceTimersByTimeAsync(900)
      expect(fetchPage.mock.calls.filter(([input]) => input.sessionID === "a")).toHaveLength(2)
      second.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  test("visible rows only protect eligible previews from their own directory", async () => {
    const fetchPage = vi.fn<FetchActivityPage>(async () => ({ data: [] }))
    const cache = createRemoteActivityCache(fetchPage)
    const consumer = cache.mount()
    const rows = Array.from({ length: 300 }, (_, index) => ({
      sessionId: String(index), directory: "/repo", updatedAt: 1,
    }))
    consumer.update(rows)
    await vi.waitFor(() => expect(cache.getSnapshot().size).toBe(300))
    // Session 299 is the newest cached preview, but its displayed row has no known directory.
    // When another preview arrives, that unusable entry should go before visible same-directory data.
    consumer.update([
      ...rows.slice(0, -1),
      { ...rows[299], directory: null },
      { sessionId: "new", directory: "/repo", updatedAt: 1 },
    ])
    await vi.waitFor(() => expect(cache.getSnapshot().has("new")).toBe(true))
    expect(cache.getSnapshot().has("0")).toBe(true)
    expect(cache.getSnapshot().has("299")).toBe(false)
    consumer.dispose()
  })

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
