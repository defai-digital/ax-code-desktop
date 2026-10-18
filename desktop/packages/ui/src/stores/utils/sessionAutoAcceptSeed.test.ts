import { describe, expect, test, vi } from "vitest"

import {
  inheritSessionAutoAccept,
  registerSessionAutoAcceptInheritHandler,
  registerSessionAutoAcceptSeedHandler,
  seedSessionAutoAccept,
} from "./sessionAutoAcceptSeed"

describe("sessionAutoAcceptSeed", () => {
  test("forwards a created session to the registered handler", () => {
    const handler = vi.fn()
    registerSessionAutoAcceptSeedHandler(handler)

    seedSessionAutoAccept("session-a", null)

    expect(handler).toHaveBeenCalledWith("session-a", null)
    registerSessionAutoAcceptSeedHandler(null)
  })

  test("replays sessions created before the handler registered", () => {
    seedSessionAutoAccept("session-b", "parent-b")

    const handler = vi.fn()
    registerSessionAutoAcceptSeedHandler(handler)

    expect(handler).toHaveBeenCalledWith("session-b", "parent-b")
    registerSessionAutoAcceptSeedHandler(null)
  })

  test("forwards a fork to the inherit handler and queues until it registers", () => {
    inheritSessionAutoAccept("fork-c", "source-c")

    const handler = vi.fn()
    registerSessionAutoAcceptInheritHandler(handler)

    expect(handler).toHaveBeenCalledWith("fork-c", "source-c")

    inheritSessionAutoAccept("fork-d", "source-d")
    expect(handler).toHaveBeenCalledWith("fork-d", "source-d")

    registerSessionAutoAcceptInheritHandler(null)
  })
})
