import { describe, expect, test } from "vitest"

import { mergeChildSessionMessages } from "./optimistic"

describe("mergeChildSessionMessages", () => {
  test("keeps the earlier messages a bounded page of the child session does not carry", () => {
    // The fetch is bounded (500 first, then 160 while the task runs), and assigning its page dropped every message
    // before it: the task record's steps and the child session's own view read this array.
    const existing = Array.from({ length: 200 }, (_, index) => ({
      id: `m${String(index).padStart(4, "0")}`,
      role: "assistant",
    }))
    const page = existing.slice(-160)

    const merged = mergeChildSessionMessages(existing as never, page as never)

    expect(merged).toHaveLength(200)
    expect(merged[0]?.id).toBe("m0000")
  })

  test("lets a page copy that changed replace the stale one", () => {
    const existing = [{ id: "m0001", role: "assistant", time: { created: 1 } }]
    const page = [{ id: "m0001", role: "assistant", time: { created: 1, completed: 9 } }]

    const merged = mergeChildSessionMessages(existing as never, page as never)

    expect(merged[0]).toBe(page[0])
  })
})
