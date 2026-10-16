import { describe, expect, test } from "vitest"
import { createMaterializationQueue } from "../session-materialization-queue"

const COOLDOWN = 5_000
const KEY = "/repo:ses_1"

describe("createMaterializationQueue", () => {
  test("skips a request while one is in flight and until the cooldown passes", () => {
    const queue = createMaterializationQueue()
    queue.begin(KEY, 0)

    expect(queue.shouldEnqueue(KEY, 1_000, COOLDOWN)).toBe(false)
    // A different session is its own slot.
    expect(queue.shouldEnqueue("/repo:ses_2", 1_000, COOLDOWN)).toBe(true)
  })

  test("does not let a request that a newer one replaced write anything", () => {
    // The first request outlives the cooldown, so a second one starts. The first is the one that
    // finishes last in the reported case, and its snapshot is older than what the second published.
    const queue = createMaterializationQueue()
    const first = queue.begin(KEY, 0)
    const second = queue.begin(KEY, COOLDOWN + 1)

    expect(queue.isCurrent(first)).toBe(false)
    expect(queue.isCurrent(second)).toBe(true)
  })

  test("a replaced request leaves the newer one's registration alone", () => {
    const queue = createMaterializationQueue()
    const first = queue.begin(KEY, 0)
    const second = queue.begin(KEY, COOLDOWN + 1)

    // The older request finishing first must not release the newer one's slot: the next gap would
    // then start a third request alongside the second.
    queue.finish(first)
    expect(queue.isCurrent(second)).toBe(true)

    queue.finish(second)
    expect(queue.shouldEnqueue(KEY, COOLDOWN * 2, COOLDOWN)).toBe(true)
    expect(queue.isCurrent(second)).toBe(false)
  })
})
