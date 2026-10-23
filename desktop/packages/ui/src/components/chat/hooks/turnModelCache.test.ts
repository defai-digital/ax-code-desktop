import { afterEach, describe, expect, test, vi } from "vitest"

import type { ChatMessageEntry } from "../lib/turns/types"
import type { TurnWindowModel } from "../lib/turns/windowTurns"
import { clearTurnModelCache, recallTurnModel, rememberTurnModel } from "./turnModelCache"

const model = (id: string): TurnWindowModel => ({
  turnIds: [id],
  turnMessageStartIndexes: [0],
  turnIndexById: new Map([[id, 0]]),
  messageToTurnId: new Map(),
  messageToTurnIndex: new Map(),
  turnCount: 1,
})

const messages = (): ChatMessageEntry[] => [{ info: { id: "m1" }, parts: [] } as unknown as ChatMessageEntry]

describe("turn model cache", () => {
  afterEach(() => {
    clearTurnModelCache()
    vi.unstubAllGlobals()
  })

  test("recalls the model for the same array and misses for a rebuilt one", () => {
    const list = messages()
    const built = model("t1")
    rememberTurnModel("ses_1", list, built)

    expect(recallTurnModel("ses_1", list)).toBe(built)
    expect(recallTurnModel("ses_1", messages())).toBeUndefined()
    expect(recallTurnModel("ses_2", list)).toBeUndefined()
  })

  test("does not hold the message array strongly", () => {
    // A collected array makes deref() return undefined; emulate that without forcing GC.
    let collected = false
    class FakeWeakRef<T extends object> {
      constructor(private target: T) {}
      deref(): T | undefined {
        return collected ? undefined : this.target
      }
    }
    vi.stubGlobal("WeakRef", FakeWeakRef)
    const list = messages()
    rememberTurnModel("ses_1", list, model("t1"))
    expect(recallTurnModel("ses_1", list)).toBeDefined()

    collected = true
    expect(recallTurnModel("ses_1", list)).toBeUndefined()
  })

  test("keeps at most 30 sessions, dropping the oldest", () => {
    const lists = Array.from({ length: 31 }, () => messages())
    lists.forEach((list, index) => rememberTurnModel(`ses_${index}`, list, model(`t${index}`)))

    expect(recallTurnModel("ses_0", lists[0])).toBeUndefined()
    expect(recallTurnModel("ses_30", lists[30])).toBeDefined()
  })
})
