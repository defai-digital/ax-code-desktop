import { describe, expect, test, vi } from "vitest"

import { createPendingToastTracker } from "./pendingToastTracker"

describe("pending toast tracker", () => {
  test("drops a session's keys when the session goes away", () => {
    // The keys were pruned only when a request was answered. A session deleted (or archived) while a request was
    // outstanding never reports a reply, so its keys stayed for the life of the renderer — unbounded, and enough to
    // suppress a toast if that key ever came back.
    const dismissed: string[] = []
    const tracker = createPendingToastTracker({ onDismiss: (kind, key) => dismissed.push(`${kind}-${key}`) })

    tracker.remember("permission", "ses_a:req_1")
    tracker.remember("question", "ses_a:q_1")
    tracker.remember("permission", "ses_b:req_2")
    expect(tracker.size("permission")).toBe(2)
    expect(tracker.size("question")).toBe(1)

    tracker.clearSession("ses_a")

    expect(tracker.has("permission", "ses_a:req_1")).toBe(false)
    expect(tracker.has("question", "ses_a:q_1")).toBe(false)
    // Another session's keys are untouched, and its entry is not a prefix match for `ses_a`.
    expect(tracker.has("permission", "ses_b:req_2")).toBe(true)
    expect(tracker.size("permission")).toBe(1)
    expect(dismissed.sort()).toEqual(["permission-ses_a:req_1", "question-ses_a:q_1"])
  })

  test("dismisses a key once, only when it was pending", () => {
    const onDismiss = vi.fn()
    const tracker = createPendingToastTracker({ onDismiss })

    tracker.clear("permission", "ses_a:req_1")
    expect(onDismiss).not.toHaveBeenCalled()

    tracker.remember("permission", "ses_a:req_1")
    tracker.clear("permission", "ses_a:req_1")
    tracker.clear("permission", "ses_a:req_1")

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onDismiss).toHaveBeenCalledWith("permission", "ses_a:req_1")
  })

  test("ignores a missing session id", () => {
    const onDismiss = vi.fn()
    const tracker = createPendingToastTracker({ onDismiss })
    tracker.remember("question", "ses_a:q_1")

    tracker.clearSession(undefined)
    tracker.clearSession(null)
    tracker.clearSession("")

    expect(tracker.size("question")).toBe(1)
    expect(onDismiss).not.toHaveBeenCalled()
  })
})
