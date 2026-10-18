import { describe, expect, test, vi } from "vitest"

import { registerSessionAutoAcceptSeedHandler, seedSessionAutoAccept } from "./sessionAutoAcceptSeed"

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
})
