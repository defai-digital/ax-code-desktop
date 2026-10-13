import { describe, expect, test } from "vitest"
import { shouldSkipSessionSync } from "../use-sync"

const PREFETCH_PAGE_SIZE = 150
const PREFETCH_TTL_MS = 15_000

describe("shouldSkipSessionSync", () => {
  test("skips when the session record and its messages are both cached", () => {
    expect(
      shouldSkipSessionSync({
        force: false,
        hasSession: true,
        hasCachedMessages: true,
        pageSize: PREFETCH_PAGE_SIZE,
      }),
    ).toBe(true)
  })

  test("never skips a forced sync", () => {
    expect(
      shouldSkipSessionSync({
        force: true,
        hasSession: true,
        hasCachedMessages: true,
        pageSize: PREFETCH_PAGE_SIZE,
      }),
    ).toBe(false)
  })

  test("fetches the session record even when the messages are cached and recent", () => {
    // `trimSessions` drops entries from the session list but leaves message and part caches
    // behind, so a trimmed session reaches this call with cached messages and no record to
    // attach them to — the TTL must not swallow that fetch.
    expect(
      shouldSkipSessionSync({
        force: false,
        hasSession: false,
        hasCachedMessages: true,
        prefetchInfo: { limit: PREFETCH_PAGE_SIZE, complete: true, at: Date.now() },
        pageSize: PREFETCH_PAGE_SIZE,
      }),
    ).toBe(false)
  })

  test("does not skip a session whose messages are not cached", () => {
    expect(
      shouldSkipSessionSync({
        force: false,
        hasSession: true,
        hasCachedMessages: false,
        pageSize: PREFETCH_PAGE_SIZE,
      }),
    ).toBe(false)
  })

  test("keeps the prefetch TTL for a session whose messages are not cached", () => {
    const now = Date.now()
    const prefetchInfo = { limit: 10, complete: false, at: now }
    expect(
      shouldSkipSessionSync({
        force: false,
        hasSession: true,
        hasCachedMessages: false,
        prefetchInfo,
        pageSize: PREFETCH_PAGE_SIZE,
        now,
      }),
    ).toBe(true)
    expect(
      shouldSkipSessionSync({
        force: false,
        hasSession: true,
        hasCachedMessages: false,
        prefetchInfo: { ...prefetchInfo, at: now - PREFETCH_TTL_MS - 1 },
        pageSize: PREFETCH_PAGE_SIZE,
        now,
      }),
    ).toBe(false)
  })
})
