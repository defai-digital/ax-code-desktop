import { describe, expect, it } from "vitest"
import { appendQueuedContentToDraft } from "./queuedMessageDraft"

describe("appendQueuedContentToDraft", () => {
  it("inserts the popped message when the composer is empty", () => {
    expect(appendQueuedContentToDraft("", "queued text")).toBe("queued text")
    expect(appendQueuedContentToDraft("   \n", "queued text")).toBe("queued text")
  })

  it("appends to the draft the user is already typing instead of replacing it", () => {
    // Regression: editing a chip replaced the composer content, so the user's draft was
    // destroyed along with the entry that had just been popped from the queue.
    expect(appendQueuedContentToDraft("half-written", "queued text")).toBe("half-written\n\nqueued text")
    expect(appendQueuedContentToDraft("half-written  ", "queued text")).toBe("half-written\n\nqueued text")
  })
})
