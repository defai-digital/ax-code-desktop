import { describe, expect, test } from "vitest"

import { pruneLastViewed, readPersistedSupervision, useSupervisionStore } from "./useSupervisionStore"

const storageWith = (value: string | null): Storage =>
  ({
    getItem: () => value,
    setItem: () => undefined,
    removeItem: () => undefined,
    clear: () => undefined,
    key: () => null,
    length: 0,
  }) as Storage

describe("readPersistedSupervision", () => {
  test("drops malformed entries and an unknown active working set", () => {
    const state = readPersistedSupervision(
      storageWith(
        JSON.stringify({
          recentSessionIds: ["a", "b"],
          lastViewedAt: { a: 1, b: "x" },
          workingSets: [{ id: "w1", name: "Release", sessionIds: ["a"] }, { id: 2 }],
          activeWorkingSetId: "missing",
        }),
      ),
    )
    expect(state.recentSessionIds).toEqual(["a", "b"])
    expect(state.lastViewedAt).toEqual({ a: 1 })
    expect(state.workingSets).toEqual([{ id: "w1", name: "Release", sessionIds: ["a"] }])
    expect(state.activeWorkingSetId).toBeNull()
  })

  test("returns empty state for invalid JSON", () => {
    expect(readPersistedSupervision(storageWith("{")).workingSets).toEqual([])
  })
})

describe("pruneLastViewed", () => {
  test("keeps the newest entries", () => {
    expect(pruneLastViewed({ a: 1, b: 3, c: 2 }, 2)).toEqual({ b: 3, c: 2 })
  })
})

describe("navigation history", () => {
  test("back and forward skip unavailable sessions and keep the forward stack", async () => {
    const { useSupervisionStore } = await import("./useSupervisionStore")
    const store = useSupervisionStore.getState()
    for (const id of ["a", "b", "c", "d"]) useSupervisionStore.getState().pushNavHistory(id)
    const available = (id: string) => id !== "c"
    expect(store.stepNavHistory(-1, available)).toBe("b")
    expect(useSupervisionStore.getState().stepNavHistory(-1, available)).toBe("a")
    expect(useSupervisionStore.getState().stepNavHistory(-1, available)).toBeNull()
    expect(useSupervisionStore.getState().stepNavHistory(1, available)).toBe("b")
    expect(useSupervisionStore.getState().stepNavHistory(1, available)).toBe("d")
    useSupervisionStore.getState().stepNavHistory(-1, available)
    useSupervisionStore.getState().pushNavHistory("e")
    expect(useSupervisionStore.getState().navHistory).toEqual(["a", "b", "e"])
  })
  test("clears the active working set when the set that filled the cap is evicted", () => {
    // The eviction path dropped the oldest set without touching `activeWorkingSetId`, which `deleteWorkingSet`
    // does clear: the stored id then pointed at a set that no longer existed, so the panel filtered by it and
    // showed nothing, no tab was selected, and the id stayed in storage until the next load repaired it.
    useSupervisionStore.setState({ workingSets: [], activeWorkingSetId: null })
    for (let index = 0; index < 50; index += 1) {
      useSupervisionStore.getState().createWorkingSet(`set ${index}`)
    }
    const oldest = useSupervisionStore.getState().workingSets[0].id
    useSupervisionStore.getState().setActiveWorkingSet(oldest)

    useSupervisionStore.getState().createWorkingSet("one more")

    const state = useSupervisionStore.getState()
    expect(state.workingSets.some((ws) => ws.id === oldest)).toBe(false)
    expect(state.activeWorkingSetId).toBeNull()
  })
})
