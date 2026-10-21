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

describe("supervision display preferences", () => {
  test("old or malformed storage defaults to comfortable rows and collapsed labels", () => {
    expect(readPersistedSupervision(storageWith("{}"))).toMatchObject({
      density: "comfortable",
      inspectorLabels: false,
    })
    expect(readPersistedSupervision(storageWith('{"density":"tiny","inspectorLabels":"true"}'))).toMatchObject({
      density: "comfortable",
      inspectorLabels: false,
    })
    expect(readPersistedSupervision(storageWith('{"density":"compact","inspectorLabels":true}'))).toMatchObject({
      density: "compact",
      inspectorLabels: true,
    })
  })
  test("display changes survive unrelated working-set updates without changing board selection", () => {
    useSupervisionStore.setState({ boardFocusSessionId: "focused" })
    useSupervisionStore.getState().setDensity("compact")
    useSupervisionStore.getState().setInspectorLabels(true)
    const id = useSupervisionStore.getState().createWorkingSet("Review")
    expect(readPersistedSupervision(localStorage)).toMatchObject({ density: "compact", inspectorLabels: true })
    expect(useSupervisionStore.getState().boardFocusSessionId).toBe("focused")
    useSupervisionStore.getState().deleteWorkingSet(id)
  })
})

describe("markSessionUnread", () => {
  test("forgets the last view so the session reads as updated, and ignores unknown sessions", () => {
    useSupervisionStore.getState().markSessionViewed("ses_1", 500)
    expect(useSupervisionStore.getState().lastViewedAt.ses_1).toBe(500)
    useSupervisionStore.getState().markSessionUnread("ses_1")
    expect("ses_1" in useSupervisionStore.getState().lastViewedAt).toBe(false)
    const before = useSupervisionStore.getState().lastViewedAt
    useSupervisionStore.getState().markSessionUnread("missing")
    expect(useSupervisionStore.getState().lastViewedAt).toBe(before)
  })
})
