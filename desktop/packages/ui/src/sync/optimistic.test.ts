import { describe, expect, test } from "vitest"
import type { Message } from "@defai-digital/ax-code-sdk/v2/client"

import { mergeChildSessionMessages } from "./optimistic"

// The store holds SDK messages, whose shape needs a dozen fields the merge never reads. One cast here keeps the
// call sites themselves type-checked.
const asMessages = (messages: Array<Record<string, unknown>>): Message[] => messages as unknown as Message[]

const numbered = (count: number) =>
  asMessages(
    Array.from({ length: count }, (_, index) => ({ id: `m${String(index).padStart(4, "0")}`, role: "assistant" })),
  )

describe("mergeChildSessionMessages", () => {
  test("keeps the earlier messages a bounded page of the child session does not carry", () => {
    // The fetch is bounded (500 first, then 160 while the task runs), and assigning its page dropped every message
    // before it: the task record's steps and the child session's own view read this array.
    const existing = numbered(200)
    const page = existing.slice(-160)

    const merged = mergeChildSessionMessages(existing, page)

    expect(merged).toHaveLength(200)
    expect(merged[0]?.id).toBe("m0000")
  })

  test("lets a page copy that changed replace the stale one", () => {
    const existing = asMessages([{ id: "m0001", role: "assistant", time: { created: 1 } }])
    const page = asMessages([{ id: "m0001", role: "assistant", time: { created: 1, completed: 9 } }])

    const merged = mergeChildSessionMessages(existing, page)

    expect(merged[0]).toBe(page[0])
  })
})
