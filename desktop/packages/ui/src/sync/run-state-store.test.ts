import { describe, expect, test } from "vitest"

import { pruneRunState, readRunState } from "./run-state-store"

const createMemoryStorage = (initial: Record<string, string> = {}): Storage => {
  const store = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size
    },
  } as Storage
}

describe("readRunState", () => {
  test("reads persisted timestamps", () => {
    const storage = createMemoryStorage({
      "oc.run-state.v1": JSON.stringify({ runEndedAt: { a: 10, b: 20 }, nudgeDismissedAt: { a: 15 } }),
    })
    expect(readRunState(storage)).toEqual({ runEndedAt: { a: 10, b: 20 }, nudgeDismissedAt: { a: 15 } })
  })

  test("returns empty maps when nothing is stored", () => {
    expect(readRunState(createMemoryStorage())).toEqual({ runEndedAt: {}, nudgeDismissedAt: {} })
  })

  test("returns empty maps for invalid JSON", () => {
    expect(readRunState(createMemoryStorage({ "oc.run-state.v1": "{" }))).toEqual({
      runEndedAt: {},
      nudgeDismissedAt: {},
    })
  })

  test("drops bad values and keeps only finite numbers", () => {
    const storage = createMemoryStorage({
      "oc.run-state.v1": JSON.stringify({
        runEndedAt: { a: 10, b: "20", c: null },
        nudgeDismissedAt: "not-a-map",
      }),
    })
    expect(readRunState(storage)).toEqual({ runEndedAt: { a: 10 }, nudgeDismissedAt: {} })
  })

  test("returns empty maps for a non-object payload", () => {
    expect(readRunState(createMemoryStorage({ "oc.run-state.v1": JSON.stringify(42) }))).toEqual({
      runEndedAt: {},
      nudgeDismissedAt: {},
    })
  })
})

describe("pruneRunState", () => {
  test("returns the snapshot unchanged at or under the limit", () => {
    const snapshot = { runEndedAt: { a: 1 }, nudgeDismissedAt: { b: 2 } }
    expect(pruneRunState(snapshot, 2)).toEqual(snapshot)
    expect(pruneRunState(snapshot)).toEqual(snapshot)
  })

  test("keeps the newest ids across either map and drops the rest from both", () => {
    const pruned = pruneRunState(
      {
        runEndedAt: { old: 1, mid: 5, fresh: 3 },
        nudgeDismissedAt: { fresh: 9, old: 2 },
      },
      2,
    )
    // "fresh" wins on its nudge timestamp (9), "mid" is next (5); "old" goes from both maps.
    expect(pruned).toEqual({ runEndedAt: { mid: 5, fresh: 3 }, nudgeDismissedAt: { fresh: 9 } })
  })

  test("breaks timestamp ties by id ascending so the result is stable", () => {
    const pruned = pruneRunState({ runEndedAt: { b: 10, a: 10, c: 10 }, nudgeDismissedAt: {} }, 2)
    expect(pruned).toEqual({ runEndedAt: { a: 10, b: 10 }, nudgeDismissedAt: {} })
  })

  test("defaults to a 200 id limit", () => {
    const runEndedAt: Record<string, number> = {}
    for (let index = 0; index < 205; index += 1) runEndedAt[`s${index}`] = index
    const pruned = pruneRunState({ runEndedAt, nudgeDismissedAt: {} })
    expect(Object.keys(pruned.runEndedAt)).toHaveLength(200)
    expect(pruned.runEndedAt.s204).toBe(204)
    expect(pruned.runEndedAt.s4).toBeUndefined()
  })
})
