import { afterEach, describe, expect, test, vi } from "vitest"

const MOCKED_STORES = [
  "@/stores/messageQueueStore",
  "@/stores/permissionStore",
  "@/stores/useSessionRollbackStore",
  "@/stores/useInlineCommentDraftStore",
  "@/stores/useSessionMultiSelectStore",
] as const

const importHelper = async () => {
  vi.resetModules()

  const spies = {
    queueClearSessions: vi.fn(),
    pruneAutoAccept: vi.fn(),
    rollbackClearSessions: vi.fn(),
    clearDrafts: vi.fn(),
    removeMany: vi.fn(),
  }

  vi.doMock("@/stores/messageQueueStore", () => ({
    useMessageQueueStore: { getState: () => ({ clearSessions: spies.queueClearSessions }) },
  }))
  vi.doMock("@/stores/permissionStore", () => ({
    usePermissionStore: { getState: () => ({ pruneAutoAccept: spies.pruneAutoAccept }) },
  }))
  vi.doMock("@/stores/useSessionRollbackStore", () => ({
    useSessionRollbackStore: { getState: () => ({ clearSessions: spies.rollbackClearSessions }) },
  }))
  vi.doMock("@/stores/useInlineCommentDraftStore", () => ({
    useInlineCommentDraftStore: { getState: () => ({ clearDrafts: spies.clearDrafts }) },
  }))
  vi.doMock("@/stores/useSessionMultiSelectStore", () => ({
    useSessionMultiSelectStore: { getState: () => ({ removeMany: spies.removeMany }) },
  }))

  const helper = await import("./sessionRemovalCleanup")
  return { helper, spies }
}

describe("cleanupRemovedSessions", () => {
  afterEach(() => {
    for (const specifier of MOCKED_STORES) {
      vi.doUnmock(specifier)
    }
    vi.resetModules()
  })

  test("prunes every session-keyed store for the removed ids", async () => {
    const { helper, spies } = await importHelper()

    helper.cleanupRemovedSessions(["ses_a", "ses_b"])

    const idSet = new Set(["ses_a", "ses_b"])
    expect(spies.queueClearSessions).toHaveBeenCalledWith(idSet)
    expect(spies.pruneAutoAccept).toHaveBeenCalledWith(idSet)
    expect(spies.rollbackClearSessions).toHaveBeenCalledWith(idSet)
    expect(spies.clearDrafts).toHaveBeenCalledTimes(2)
    expect(spies.clearDrafts).toHaveBeenCalledWith("ses_a")
    expect(spies.clearDrafts).toHaveBeenCalledWith("ses_b")
    expect(spies.removeMany).toHaveBeenCalledWith(["ses_a", "ses_b"])
  })

  test("forgets runtime goals for the removed sessions", async () => {
    const { helper } = await importHelper()
    const { useSessionGoalStore } = await import("@/stores/useSessionGoalStore")
    const { normalizeSessionGoal } = await import("@/lib/supervision/goal")
    const goal = normalizeSessionGoal({
      sessionID: "ses_a",
      objective: "Ship it",
      status: "blocked",
      tokensUsed: 0,
      timeUsedSeconds: 0,
      time: { created: 1, updated: 2 },
    })
    if (!goal) throw new Error("fixture must normalize")
    useSessionGoalStore.getState().clear()
    useSessionGoalStore.getState().applyEvent("ses_a", goal)
    useSessionGoalStore.getState().applyEvent("ses_b", { ...goal, sessionId: "ses_b" })

    helper.cleanupRemovedSessions(["ses_a"])

    expect(useSessionGoalStore.getState().goals.ses_a).toBeUndefined()
    expect(useSessionGoalStore.getState().known.ses_a).toBeUndefined()
    expect(useSessionGoalStore.getState().eventSeq.ses_a).toBeUndefined()
    expect(useSessionGoalStore.getState().goals.ses_b?.sessionId).toBe("ses_b")
  })

  test("drops the in-flight goal-read claim for each removed session", async () => {
    const { helper } = await importHelper()
    const dropped: string[][] = []
    helper.registerSessionGoalReadClaimDrop((ids) => {
      dropped.push([...ids])
    })
    try {
      helper.cleanupRemovedSessions([])
      helper.cleanupRemovedSessions(["ses_a", "ses_b"])
      expect(dropped).toEqual([["ses_a", "ses_b"]])
    } finally {
      helper.registerSessionGoalReadClaimDrop(null)
    }
  })

  test("no-ops on an empty id set without touching any store", async () => {
    const { helper, spies } = await importHelper()

    helper.cleanupRemovedSessions([])

    for (const spy of Object.values(spies)) {
      expect(spy).not.toHaveBeenCalled()
    }
  })
})
