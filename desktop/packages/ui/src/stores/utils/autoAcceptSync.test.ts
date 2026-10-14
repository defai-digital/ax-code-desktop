import { describe, expect, test, vi } from "vitest"

import { createAutoAcceptSync } from "./autoAcceptSync"

const createPost = () => vi.fn(async () => ({ ok: true }))

// vi.fn with zero declared parameters records `[]`; assertions read the recorded
// arguments, so name their shape once.
const callsOf = (mock: { mock: { calls: unknown[] } }): Array<[string, boolean]> =>
  mock.mock.calls as Array<[string, boolean]>

describe("createAutoAcceptSync", () => {
  test("reports the desired value to the server", async () => {
    const post = createPost()
    const sync = createAutoAcceptSync({ post, schedule: vi.fn() })

    sync.set("root", true)
    await sync.flushPending()

    expect(post).toHaveBeenCalledWith("root", true)
    expect(sync.pendingEntries()).toEqual([])
  })

  test("keeps a value pending when the server rejects it, and retries", async () => {
    // A non-2xx response used to be invisible: the fetch only had a catch for
    // network rejections, so the client silently stopped auto-responding while
    // the server kept suppressing notifications.
    const scheduled: Array<{ callback: () => void; delayMs: number }> = []
    let acceptRequests = false
    const post = vi.fn(async () => ({ ok: acceptRequests }))
    const sync = createAutoAcceptSync({
      post,
      schedule: (callback, delayMs) => {
        scheduled.push({ callback, delayMs })
        return 0
      },
      retryDelaysMs: [10],
    })

    sync.set("root", true)
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1))

    expect(sync.pendingEntries()).toEqual([["root", true]])
    expect(scheduled).toHaveLength(1)

    // The scheduled retry confirms the value and clears the pending entry.
    acceptRequests = true
    scheduled[0].callback()
    await vi.waitFor(() => expect(sync.pendingEntries()).toEqual([]))
  })

  test("keeps a value pending when the request rejects", async () => {
    const post = vi.fn(async () => {
      throw new Error("offline")
    })
    const logger = { warn: vi.fn() }
    const sync = createAutoAcceptSync({ post, schedule: vi.fn(), logger, retryDelaysMs: [] })

    sync.set("root", false)
    await sync.flushPending()

    expect(sync.pendingEntries()).toEqual([["root", false]])
    expect(logger.warn).toHaveBeenCalled()
  })

  test("sends the last value first when toggled twice in a row", async () => {
    const post = createPost()
    const sync = createAutoAcceptSync({ post, schedule: vi.fn() })

    sync.set("root", true)
    sync.set("root", false)
    await sync.flushPending()

    // Both requests are serialised for the session, and the final state wins.
    const sent = callsOf(post).map((call) => call[1])
    expect(sent.at(-1)).toBe(false)
  })

  test("flushes entries left pending from an earlier run", async () => {
    let reachable = false
    const post = vi.fn(async () => ({ ok: reachable }))
    const sync = createAutoAcceptSync({ post, schedule: vi.fn(), retryDelaysMs: [] })

    sync.set("root", false)
    sync.set("child", true)
    await sync.flushPending()

    // A reconnect/rehydrate replay must include the `false` entries too: the old
    // rehydrate only re-sent the `true` ones, so server-side suppression for a
    // switched-off session was never cleared.
    expect(sync.pendingEntries()).toContainEqual(["root", false])
    expect(sync.pendingEntries()).toContainEqual(["child", true])

    reachable = true
    await sync.flushPending()

    expect(sync.pendingEntries()).toEqual([])
    expect(post).toHaveBeenCalledWith("root", false)
    expect(post).toHaveBeenCalledWith("child", true)
  })
})
