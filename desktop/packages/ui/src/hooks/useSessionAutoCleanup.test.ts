import React from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, test, vi } from "vitest"

import { applySessionRetentionAction, buildAutoDeleteCandidates } from "./useSessionAutoCleanup"

const scopedSdk = (overrides: { update?: unknown; delete?: unknown } = {}) =>
  ({
    session: {
      update: vi.fn(async () => ({ data: {} })),
      delete: vi.fn(async () => ({ data: true })),
      ...overrides,
    },
  }) as never

describe("buildAutoDeleteCandidates", () => {
  const DAY = 24 * 60 * 60 * 1000
  const now = 100 * DAY
  const session = (id: string, daysAgo: number, parentID?: string) =>
    ({ id, parentID, time: { created: now - daysAgo * DAY, updated: now - daysAgo * DAY } }) as never

  test("keeps an expired parent whose child is still kept", () => {
    // Deleting a session cascades to its children on the runtime, so cleaning up
    // the parent would also delete the recent child.
    const sessions = [session("parent", 40), session("child", 1, "parent"), session("old", 40)]

    expect(buildAutoDeleteCandidates({ sessions, currentSessionId: null, cutoffDays: 30, keepRecent: 0, now })).toEqual(
      ["old"],
    )
  })

  test("keeps every ancestor of the open session", () => {
    const sessions = [session("root", 40), session("mid", 40, "root"), session("leaf", 40, "mid"), session("old", 40)]

    expect(
      buildAutoDeleteCandidates({ sessions, currentSessionId: "leaf", cutoffDays: 30, keepRecent: 0, now }),
    ).toEqual(["old"])
  })

  test("retains an expired active parent of an archived child", () => {
    const sessions = [session("parent", 40), session("old", 40)]
    const archivedSessions = [session("archived-child", 50, "parent")]
    expect(buildAutoDeleteCandidates({ sessions, archivedSessions, currentSessionId: null, cutoffDays: 30, keepRecent: 0, now })).toEqual(["old"])
  })

  test("follows archived intermediates to protect every active ancestor", () => {
    const sessions = [session("root", 40), session("leaf", 1, "archived-mid"), session("old", 40)]
    const archivedSessions = [session("archived-mid", 50, "root")]
    expect(buildAutoDeleteCandidates({ sessions, archivedSessions, currentSessionId: "leaf", cutoffDays: 30, keepRecent: 0, now })).toEqual(["old"])
  })

  test("archive retention still archives an expired parent of an archived child", () => {
    const sessions = [session("parent", 40)]
    const archivedSessions = [session("archived-child", 50, "parent")]
    expect(buildAutoDeleteCandidates({ sessions, archivedSessions, action: "archive", currentSessionId: null, cutoffDays: 30, keepRecent: 0, now })).toEqual(["parent"])
  })

  test("archive retention archives an expired parent whose child is kept", () => {
    // Archiving does not cascade (only delete does), so a kept child must not
    // pin its expired parent in the active list forever.
    const sessions = [session("parent", 40), session("child", 1, "parent"), session("old", 40)]
    expect(buildAutoDeleteCandidates({ sessions, action: "archive", currentSessionId: null, cutoffDays: 30, keepRecent: 0, now })).toEqual(["parent", "old"])
  })

  test("still cleans up an expired parent with expired children", () => {
    const sessions = [session("parent", 40), session("child", 41, "parent")]

    expect(buildAutoDeleteCandidates({ sessions, currentSessionId: null, cutoffDays: 30, keepRecent: 0, now })).toEqual(
      ["parent", "child"],
    )
  })
})

describe("applySessionRetentionAction", () => {
  test("rechecks eligibility after a rate-limit wait before retrying a delete", async () => {
    vi.useFakeTimers()
    try {
      let eligible = true
      const remove = vi.fn()
        .mockResolvedValueOnce({ error: { message: "Rate limited" }, response: { status: 429 } })
        .mockResolvedValue({ data: true, response: { status: 200 } })
      const pending = applySessionRetentionAction(scopedSdk({ delete: remove }), "ses_1", "/repo", "delete", () => eligible)
      await Promise.resolve()
      eligible = false
      await vi.advanceTimersByTimeAsync(1000)
      const result = await pending
      expect(remove).toHaveBeenCalledTimes(1)
      expect(result).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })
  test("reports a rejected archive as not completed", async () => {
    // The generated SDK resolves with `{ error }` instead of throwing, so a
    // rejected cleanup used to be counted as completed.
    const sdk = scopedSdk({ update: vi.fn(async () => ({ error: { message: "Internal error" } })) })

    await expect(applySessionRetentionAction(sdk, "ses_1", "/repo", "archive")).resolves.toBe(false)
  })

  test("reports a rejected delete as not completed", async () => {
    const sdk = scopedSdk({ delete: vi.fn(async () => ({ error: { message: "Internal error" } })) })

    await expect(applySessionRetentionAction(sdk, "ses_1", "/repo", "delete")).resolves.toBe(false)
  })

  test("reports an already-deleted session as completed", async () => {
    // Deleting an expired parent cascades to its children on the runtime, so the
    // same run gets 404 for those children.
    const sdk = scopedSdk({
      delete: vi.fn(async () => ({
        error: { name: "SessionNotFoundError", message: "Session not found", status: 404 },
        response: { status: 404 },
      })),
    })

    await expect(applySessionRetentionAction(sdk, "ses_1", "/repo", "delete")).resolves.toBe(true)
  })

  test("reports a confirmed cleanup as completed", async () => {
    await expect(applySessionRetentionAction(scopedSdk(), "ses_1", "/repo", "delete")).resolves.toBe(true)
  })

  test("rethrows a transport error so the caller records the failure", async () => {
    const sdk = scopedSdk({
      delete: vi.fn(async () => {
        throw new Error("offline")
      }),
    })

    await expect(applySessionRetentionAction(sdk, "ses_1", "/repo", "delete")).rejects.toThrow("offline")
  })
})

describe("live retention safety", () => {
  test.each(["activity", "child", "pending", "pending-before"])("rechecks %s changes before deleting the next candidate", async (change) => {
    vi.resetModules()
    const now = Date.now()
    const session = (id: string, age: number, parentID?: string) =>
      ({ id, parentID, directory: "/repo", time: { created: now - age, updated: now - age } }) as never
    const activeSessions = [
      ...Array.from({ length: 5 }, (_, index) => session(`recent-${index}`, 1000)),
      session("first", 40 * 86400000), session("second", 41 * 86400000),
    ]
    vi.doMock("@/stores/useGlobalSessionsStore", async () => {
      const actual = await vi.importActual<typeof import("@/stores/useGlobalSessionsStore")>("@/stores/useGlobalSessionsStore")
      return { ...actual, ensureGlobalSessionsLoaded: vi.fn(async () => ({ activeSessions, archivedSessions: [] })) }
    })
    const { useSessionAutoCleanup } = await import("./useSessionAutoCleanup")
    const { useUIStore } = await import("@/stores/useUIStore")
    const { useSessionUIStore } = await import("@/sync/session-ui-store")
    const { useGlobalSessionsStore } = await import("@/stores/useGlobalSessionsStore")
    const { axCodeClient } = await import("@/lib/ax-code/client")
    const remove = vi.fn(async () => {
      if (change === "activity") {
        useGlobalSessionsStore.getState().applySessionEvent({ type: "session.updated", properties: { info: session("second", 0) } })
      } else if (change === "child") {
        useGlobalSessionsStore.getState().applySessionEvent({ type: "session.created", properties: { info: session("new-child", 0, "second") } })
      } else {
        useGlobalSessionsStore.getState().markPendingRemoval([{ session: session("hidden-child", 0, "second"), kind: "archive" }])
      }
      return { data: true }
    })
    const scoped = vi.spyOn(axCodeClient, "getScopedSdkClient").mockReturnValue(scopedSdk({ delete: remove }))
    useUIStore.setState({ autoDeleteEnabled: true, autoDeleteAfterDays: 30, sessionRetentionAction: "delete", autoDeleteLastRunAt: 0 })
    useSessionUIStore.setState({ currentSessionId: null, isLoading: false })
    useGlobalSessionsStore.setState({ activeSessions, archivedSessions: [], pendingRemoval: new Map(), hasLoaded: true, status: "ready" })
    if (change === "pending-before") {
      useGlobalSessionsStore.getState().markPendingRemoval([{ session: session("hidden-child", 0, "second"), kind: "archive" }])
    }
    let hook: ReturnType<typeof useSessionAutoCleanup> | null = null
    const Probe = () => { hook = useSessionAutoCleanup({ autoRun: false }); return null }
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const container = document.createElement("div")
    const root = createRoot(container)
    try {
      await React.act(async () => { root.render(React.createElement(Probe)) })
      const result = await React.act(async () => hook!.runCleanup({ force: true }))
      expect(remove.mock.calls).toEqual(change === "pending-before" ? [] : [[{ sessionID: "first", directory: "/repo" }]])
      expect(result.completedIds).toEqual(change === "pending-before" ? [] : ["first"])
      expect(useUIStore.getState().autoDeleteLastRunAt).toBe(0)
    } finally {
      await React.act(async () => { root.unmount() })
      scoped.mockRestore()
      useGlobalSessionsStore.setState({ activeSessions: [], archivedSessions: [], pendingRemoval: new Map(), hasLoaded: false, status: "idle" })
      vi.doUnmock("@/stores/useGlobalSessionsStore")
      vi.resetModules()
    }
  })
})

describe("archived descendant retention", () => {
  test.each([false, true])("preserves archived descendants and refuses an incomplete inventory (unavailable: %s)", async (unavailable) => {
    vi.resetModules()
    const now = Date.now()
    const session = (id: string, age: number, parentID?: string) =>
      ({ id, parentID, directory: "/repo", time: { created: now - age, updated: now - age } }) as never
    const activeSessions = [
      ...Array.from({ length: 5 }, (_, index) => session(`recent-${index}`, 1000)),
      session("parent", 40 * 86400000),
    ]
    const archivedSessions = unavailable ? [] : [session("archived-child", 50 * 86400000, "parent")]
    vi.doMock("@/stores/useGlobalSessionsStore", async () => {
      const actual = await vi.importActual<typeof import("@/stores/useGlobalSessionsStore")>("@/stores/useGlobalSessionsStore")
      return { ...actual, ensureGlobalSessionsLoaded: vi.fn(async () => ({ activeSessions, archivedSessions })) }
    })
    const { useSessionAutoCleanup } = await import("./useSessionAutoCleanup")
    const { useUIStore } = await import("@/stores/useUIStore")
    const { useSessionUIStore } = await import("@/sync/session-ui-store")
    const { useGlobalSessionsStore } = await import("@/stores/useGlobalSessionsStore")
    const { axCodeClient } = await import("@/lib/ax-code/client")
    const scoped = vi.spyOn(axCodeClient, "getScopedSdkClient").mockReturnValue(scopedSdk())
    useUIStore.setState({ autoDeleteEnabled: true, autoDeleteAfterDays: 30, sessionRetentionAction: "delete", autoDeleteLastRunAt: 0 })
    useSessionUIStore.setState({ currentSessionId: null, isLoading: false })
    useGlobalSessionsStore.setState({ activeSessions, archivedSessions, hasLoaded: true, status: unavailable ? "error" : "ready" })
    let hook: ReturnType<typeof useSessionAutoCleanup> | null = null
    const Probe = () => { hook = useSessionAutoCleanup({ autoRun: false }); return null }
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    try {
      await React.act(async () => { root.render(React.createElement(Probe)) })
      expect(hook!.candidates).toEqual(unavailable ? ["parent"] : [])
      const result = await React.act(async () => hook!.runCleanup({ force: true }))
      expect(result).toMatchObject({ completedIds: [], failedIds: [], skippedReason: unavailable ? "loading" : "no-candidates" })
      expect(scoped).not.toHaveBeenCalled()
    } finally {
      await React.act(async () => { root.unmount() })
      container.remove()
      scoped.mockRestore()
      useGlobalSessionsStore.setState({ activeSessions: [], archivedSessions: [], hasLoaded: false, status: "idle" })
      vi.doUnmock("@/stores/useGlobalSessionsStore")
      vi.resetModules()
    }
  })
})

describe("runCleanup re-entry guard", () => {
  test("a concurrent run joins the one still loading sessions", async () => {
    vi.resetModules()
    let releaseLoad: ((value: { activeSessions: never[] }) => void) | null = null
    vi.doMock("@/stores/useGlobalSessionsStore", async () => {
      const actual = await vi.importActual<typeof import("@/stores/useGlobalSessionsStore")>(
        "@/stores/useGlobalSessionsStore",
      )
      return {
        ...actual,
        ensureGlobalSessionsLoaded: vi.fn(
          () =>
            new Promise<{ activeSessions: never[] }>((resolve) => {
              releaseLoad = resolve
            }),
        ),
      }
    })

    const { useSessionAutoCleanup } = await import("./useSessionAutoCleanup")
    const { useUIStore } = await import("@/stores/useUIStore")
    useUIStore.setState({
      autoDeleteEnabled: true,
      autoDeleteAfterDays: 30,
      sessionRetentionAction: "delete",
      autoDeleteLastRunAt: 0,
    })

    let hook: ReturnType<typeof useSessionAutoCleanup> | null = null
    const Probe = (): null => {
      hook = useSessionAutoCleanup({ autoRun: false })
      return null
    }

    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)

    try {
      await React.act(async () => {
        root.render(React.createElement(Probe))
      })

      // The first run reaches the pending session load with the guard held. A second call joins it
      // rather than bouncing off: it waits for the same run and reports its outcome, so a manual run
      // clicked during the automatic one neither repeats its work nor reports an empty result.
      const first = hook!.runCleanup({ force: true })
      const second = hook!.runCleanup({ force: true })

      await React.act(async () => {
        releaseLoad?.({ activeSessions: [] })
        await first
      })
      await expect(first).resolves.toMatchObject({ skippedReason: "no-candidates" })
      await expect(second).resolves.toMatchObject({ skippedReason: "no-candidates" })
    } finally {
      await React.act(async () => {
        root.unmount()
      })
      container.remove()
      vi.doUnmock("@/stores/useGlobalSessionsStore")
      vi.resetModules()
    }
  })
})

describe("runCleanup skip reasons", () => {
  test("a forced run still refuses while the session list is loading, and says so", async () => {
    vi.resetModules()
    const { useSessionAutoCleanup } = await import("./useSessionAutoCleanup")
    const { useUIStore } = await import("@/stores/useUIStore")
    const { useSessionUIStore } = await import("@/sync/session-ui-store")

    useUIStore.setState({
      autoDeleteEnabled: true,
      autoDeleteAfterDays: 30,
      sessionRetentionAction: "delete",
      autoDeleteLastRunAt: 0,
    })
    useSessionUIStore.setState({ isLoading: true })

    let hook: ReturnType<typeof useSessionAutoCleanup> | null = null
    const Probe = (): null => {
      hook = useSessionAutoCleanup({ autoRun: false })
      return null
    }

    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)

    try {
      await React.act(async () => {
        root.render(React.createElement(Probe))
      })

      // The settings page forces the run, so refusing it is the only outcome that can explain an empty
      // result: the "keep the newest N" protection cannot pick a correct set from a partial list. The
      // caller needs to tell that apart from "nothing was eligible".
      const result = await React.act(async () => hook!.runCleanup({ force: true }))

      expect(result).toMatchObject({ completedIds: [], failedIds: [], skippedReason: "loading" })
    } finally {
      await React.act(async () => {
        root.unmount()
      })
      container.remove()
      useSessionUIStore.setState({ isLoading: false })
      vi.resetModules()
    }
  })

  test("a run that skipped before its first await does not become the latch for every later run", async () => {
    // The body returns before its first await on the disabled/loading/cooldown skips, and an
    // async function that returns before awaiting finishes synchronously — including its
    // `finally`, which cleared the latch before the latch was assigned. The sticky promise then
    // answered every later run for the rest of the app's life, so retention never ran again.
    vi.resetModules()
    vi.doMock("@/stores/useGlobalSessionsStore", async () => {
      const actual = await vi.importActual<typeof import("@/stores/useGlobalSessionsStore")>(
        "@/stores/useGlobalSessionsStore",
      )
      return { ...actual, ensureGlobalSessionsLoaded: vi.fn(async () => ({ activeSessions: [] })) }
    })

    const { useSessionAutoCleanup } = await import("./useSessionAutoCleanup")
    const { useUIStore } = await import("@/stores/useUIStore")
    const { useSessionUIStore } = await import("@/sync/session-ui-store")

    useUIStore.setState({
      autoDeleteEnabled: true,
      autoDeleteAfterDays: 30,
      sessionRetentionAction: "delete",
      autoDeleteLastRunAt: 0,
    })
    useSessionUIStore.setState({ isLoading: true })

    let hook: ReturnType<typeof useSessionAutoCleanup> | null = null
    const Probe = (): null => {
      hook = useSessionAutoCleanup({ autoRun: false })
      return null
    }

    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)

    try {
      await React.act(async () => {
        root.render(React.createElement(Probe))
      })

      const skipped = await React.act(async () => hook!.runCleanup({ force: true }))
      expect(skipped).toMatchObject({ skippedReason: "loading" })

      // The load finished and nothing is stale: the next run has to be evaluated on its own
      // terms instead of replaying the skip from the first one. The store change re-renders the
      // probe, which is what replaces the captured `isLoading` in the hook's callback.
      await React.act(async () => {
        useSessionUIStore.setState({ isLoading: false })
      })
      const next = await React.act(async () => hook!.runCleanup({ force: true }))

      expect(next).toMatchObject({ skippedReason: "no-candidates" })
    } finally {
      await React.act(async () => {
        root.unmount()
      })
      container.remove()
      useSessionUIStore.setState({ isLoading: false })
      vi.doUnmock("@/stores/useGlobalSessionsStore")
      vi.resetModules()
    }
  })
})
