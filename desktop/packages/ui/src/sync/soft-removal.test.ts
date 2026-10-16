/**
 * S4.5 contract tests for the soft-removal (pendingRemoval) flow:
 * - user action hides the session from the global index INSTANTLY
 *   (markPendingRemoval), with no manual write needed afterwards;
 * - a session.deleted event landing during/after the undo window never
 *   resurrects the session;
 * - a FAILED removal emits no event, so the optimistic rollback re-upsert is
 *   what restores the session;
 * - an archive commit needs no manual archived-bucket write — the pending
 *   flag is released first, so the session.updated(time.archived) event is
 *   the writer of record that fills the archived bucket.
 */

import { beforeEach, describe, expect, test, vi } from "vitest"
import type { Session } from "@defai-digital/ax-code-sdk/v2"

const deleteSessionMock = vi.fn<(sessionId: string) => Promise<boolean>>()
const archiveSessionMock = vi.fn<(sessionId: string) => Promise<boolean>>()
const setCurrentSessionMock = vi.fn()

vi.doMock("@/components/ui", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.doMock("@/lib/ax-code/client", () => ({
  axCodeClient: {
    getSdkClient: vi.fn(),
    getScopedSdkClient: vi.fn(),
  },
}))

vi.doMock("@/sync/session-ui-store", () => ({
  useSessionUIStore: {
    getState: () => ({
      currentSessionId: null,
      setCurrentSession: setCurrentSessionMock,
    }),
  },
}))

vi.doMock("@/sync/session-actions", () => ({
  deleteSession: deleteSessionMock,
  archiveSession: archiveSessionMock,
}))

vi.doMock("@/lib/i18n/store", () => ({
  formatMessage: (_dictionary: unknown, key: string) => key,
  useI18nStore: { getState: () => ({ dictionary: {} }) },
}))

import { useGlobalSessionsStore } from "@/stores/useGlobalSessionsStore"

// vi.doMock above is not hoisted, so the mocked modules must be imported
// dynamically after registration.
const { toast } = await import("@/components/ui")
const { axCodeClient } = await import("@/lib/ax-code/client")

const { softDeleteSession, softArchiveSession, flushPendingRemovals, recoverPendingRemovals } = await import(
  "./soft-removal"
)

const STORAGE_KEY_PREFIX = "axcode.pending-session-removals"
const pendingKey = (owner: string) => `${STORAGE_KEY_PREFIX}.pending.${owner}`
const aliveKey = (owner: string) => `${STORAGE_KEY_PREFIX}.alive.${owner}`

const toastSuccessMock = vi.mocked(toast.success)
const toastErrorMock = vi.mocked(toast.error)

// jsdom's Storage is not enumerable through Object.keys; walk it explicitly.
const storedSlots = (): string[] => {
  const keys: string[] = []
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)
    if (key && key.startsWith(`${STORAGE_KEY_PREFIX}.pending.`)) keys.push(key)
  }
  return keys
}

const makeSession = (id: string, overrides: Partial<Session> = {}): Session =>
  ({
    id,
    title: `Session ${id}`,
    time: { created: 1, updated: 2 },
    ...overrides,
  }) as Session

const sessionEvent = (type: string, session: Session) => ({ type, properties: { info: session } })

const resetStore = () => {
  useGlobalSessionsStore.setState({
    activeSessions: [],
    archivedSessions: [],
    sessionsByDirectory: new Map(),
    pendingRemoval: new Map(),
    hasLoaded: true,
    status: "ready",
  })
}

const flushAndSettle = async () => {
  flushPendingRemovals()
  // commitRemovals is fire-and-forget from flushPendingRemovals; wait until it
  // has released the pending flags (its first store write after the API calls).
  await vi.waitFor(() => {
    expect(useGlobalSessionsStore.getState().pendingRemoval.size).toBe(0)
  })
  // Let the post-commit failure handling (if any) settle.
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe("soft-removal S4.5 contract", () => {
  beforeEach(() => {
    window.localStorage.clear()
    resetStore()
    deleteSessionMock.mockReset()
    archiveSessionMock.mockReset()
    setCurrentSessionMock.mockClear()
    // The failure toasts are asserted as "the rollback finished" signals, so a
    // call left over from an earlier test must not satisfy the wait.
    toastSuccessMock.mockClear()
    toastErrorMock.mockClear()
  })

  test("delete flow: pendingRemoval hides instantly; the delete event never resurrects", async () => {
    const session = makeSession("ses_a", { directory: "/repo" } as Partial<Session>)
    // Create flow: the session.created event alone populates the index — no
    // manual upsert anywhere in this test.
    useGlobalSessionsStore.getState().applySessionEvent(sessionEvent("session.created", session))
    expect(useGlobalSessionsStore.getState().activeSessions.map((s) => s.id)).toEqual(["ses_a"])

    deleteSessionMock.mockResolvedValue(true)
    softDeleteSession(session)

    // Instant hide — no waiting for the SDK call or the event round-trip.
    expect(useGlobalSessionsStore.getState().activeSessions).toHaveLength(0)
    expect(useGlobalSessionsStore.getState().pendingRemoval.has("ses_a")).toBe(true)

    // A delete event arriving during the undo window is a no-op.
    useGlobalSessionsStore.getState().applySessionEvent(sessionEvent("session.deleted", session))
    expect(useGlobalSessionsStore.getState().pendingRemoval.has("ses_a")).toBe(true)

    await flushAndSettle()
    expect(deleteSessionMock).toHaveBeenCalledWith("ses_a")
    expect(useGlobalSessionsStore.getState().activeSessions).toHaveLength(0)

    // The real session.deleted event lands after commit — still no resurrect.
    useGlobalSessionsStore.getState().applySessionEvent(sessionEvent("session.deleted", session))
    expect(useGlobalSessionsStore.getState().activeSessions).toHaveLength(0)
    expect(useGlobalSessionsStore.getState().archivedSessions).toHaveLength(0)
  })

  test("failed removal restores the session via the optimistic rollback (no event exists on failure)", async () => {
    const session = makeSession("ses_b")
    useGlobalSessionsStore.getState().applySessionEvent(sessionEvent("session.created", session))

    deleteSessionMock.mockResolvedValue(false)
    softDeleteSession(session)
    expect(useGlobalSessionsStore.getState().activeSessions).toHaveLength(0)

    await flushAndSettle()

    // No event is emitted for a failed delete — the rollback re-upsert is the
    // only mechanism that brings the session back.
    expect(useGlobalSessionsStore.getState().activeSessions.map((s) => s.id)).toEqual(["ses_b"])
  })

  test("does not queue a failure the user was already told about", async () => {
    // The undo-window timer runs while the user is looking: it reports the failure and puts the session
    // back, so writing the entry into the recovery slot would delete the session on the next launch
    // without them asking again. Only the unload flush — whose outcome nobody can see — keeps it.
    vi.useFakeTimers()
    try {
      const session = makeSession("ses_seen", { directory: "/repo" } as Partial<Session>)
      useGlobalSessionsStore.getState().applySessionEvent(sessionEvent("session.created", session))
      deleteSessionMock.mockResolvedValue(false)

      softDeleteSession(session)
      await vi.advanceTimersByTimeAsync(7_000)

      expect(toastErrorMock).toHaveBeenCalled()
      expect(storedSlots()).toEqual([])
      expect(useGlobalSessionsStore.getState().activeSessions.map((entry) => entry.id)).toEqual(["ses_seen"])
    } finally {
      vi.useRealTimers()
    }
  })

  test("keeps the quit-recovery record when a flushed removal fails fast", async () => {
    // `flushPendingRemovals` runs on beforeunload: it releases the pending flags before the requests
    // and then persisted the store's map, which that release had already emptied. A removal that
    // failed fast (the runtime shutting down with it) therefore wrote an empty slot and wiped the
    // quit-recovery record — the next launch found nothing to finish and resurrected the session the
    // user had deleted. The function's own contract says those entries are intentionally kept.
    const session = makeSession("ses_q", { directory: "/repo" } as Partial<Session>)
    useGlobalSessionsStore.getState().applySessionEvent(sessionEvent("session.created", session))

    deleteSessionMock.mockResolvedValue(false)
    softDeleteSession(session)

    const owner = storedSlots()[0]?.split(".").pop() ?? ""
    expect(owner).not.toBe("")
    const key = pendingKey(owner)
    const persistedBefore: Array<{ id: string }> = JSON.parse(window.localStorage.getItem(key) ?? "[]")
    expect(persistedBefore.map((entry) => entry.id)).toEqual(["ses_q"])

    flushPendingRemovals()
    await vi.waitFor(() => expect(toastErrorMock).toHaveBeenCalled())

    const persisted: Array<{ id: string; kind: string; directory: string | null }> = JSON.parse(
      window.localStorage.getItem(key) ?? "[]",
    )
    expect(persisted.map((entry) => entry.id)).toEqual(["ses_q"])
    expect(persisted[0]).toMatchObject({ id: "ses_q", kind: "delete", directory: "/repo" })
  })

  test("a failed commit does not roll a newer event entry back to the pre-removal snapshot", async () => {
    const session = makeSession("ses_r", { directory: "/repo" } as Partial<Session>)
    useGlobalSessionsStore.getState().applySessionEvent(sessionEvent("session.created", session))

    const deleteControl: { resolve: ((value: boolean) => void) | null } = { resolve: null }
    deleteSessionMock.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          deleteControl.resolve = resolve
        }),
    )

    softDeleteSession(session)
    flushPendingRemovals()
    await vi.waitFor(() => {
      expect(useGlobalSessionsStore.getState().pendingRemoval.size).toBe(0)
    })

    // The pending flag is released, so a newer session.updated applies while the
    // delete request is still in flight.
    const renamed = makeSession("ses_r", {
      directory: "/repo",
      title: "renamed",
      time: { created: 1, updated: 99 },
    } as Partial<Session>)
    useGlobalSessionsStore.getState().applySessionEvent(sessionEvent("session.updated", renamed))

    deleteControl.resolve?.(false)
    // The failure toast is emitted after the rollback loop, so waiting for it
    // guarantees the restore actually ran before the assertion.
    await vi.waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalled()
    })
    const entry = useGlobalSessionsStore.getState().activeSessions.find((candidate) => candidate.id === "ses_r")
    expect(entry?.title).toBe("renamed")
    expect((entry?.time as { updated?: number } | undefined)?.updated).toBe(99)
  })

  test("archive commit releases the pending flag so the session.updated event fills the archived bucket", async () => {
    const session = makeSession("ses_c")
    useGlobalSessionsStore.getState().applySessionEvent(sessionEvent("session.created", session))

    archiveSessionMock.mockResolvedValue(true)
    softArchiveSession(session)
    expect(useGlobalSessionsStore.getState().activeSessions).toHaveLength(0)

    await flushAndSettle()
    expect(archiveSessionMock).toHaveBeenCalledWith("ses_c")
    // No manual archived-bucket write happened — the bucket is still empty
    // until the event arrives.
    expect(useGlobalSessionsStore.getState().archivedSessions).toHaveLength(0)

    const archived = makeSession("ses_c", { time: { created: 1, updated: 2, archived: 10 } } as Partial<Session>)
    useGlobalSessionsStore.getState().applySessionEvent(sessionEvent("session.updated", archived))
    expect(useGlobalSessionsStore.getState().activeSessions).toHaveLength(0)
    expect(useGlobalSessionsStore.getState().archivedSessions.map((s) => s.id)).toEqual(["ses_c"])
  })

  test("an undo in one window does not erase another window's persisted pending removals", async () => {
    const session = makeSession("ses_mine", { directory: "/repo" } as Partial<Session>)
    useGlobalSessionsStore.getState().applySessionEvent(sessionEvent("session.created", session))

    deleteSessionMock.mockResolvedValue(true)
    softDeleteSession(session)

    // A second, concurrently open window has its own pending removal persisted.
    const otherKey = pendingKey("other-window")
    window.localStorage.setItem(otherKey, JSON.stringify([{ id: "ses_other", kind: "delete", directory: null }]))

    // Undo via the toast action empties this window's map, which used to
    // removeItem() the single shared key and wipe the other window's entry.
    const call = toastSuccessMock.mock.calls.at(-1)
    const action = call?.[1]?.action as { onClick: () => void } | undefined
    expect(action).toBeDefined()
    action?.onClick()

    expect(useGlobalSessionsStore.getState().pendingRemoval.size).toBe(0)
    expect(window.localStorage.getItem(otherKey)).not.toBeNull()
    // This window's own slot is gone (its undo cleared it).
    expect(useGlobalSessionsStore.getState().activeSessions.map((s) => s.id)).toEqual(["ses_mine"])
  })

  test("keeps removals the runtime did not confirm so the next launch retries them", async () => {
    const sdkDelete = vi.fn(async () => ({ error: { message: "connect ECONNREFUSED" } }))
    const sdkUpdate = vi.fn(async () => ({ error: { message: "connect ECONNREFUSED" } }))
    vi.mocked(axCodeClient.getSdkClient).mockReturnValue({
      session: { delete: sdkDelete, update: sdkUpdate },
    } as never)

    window.localStorage.setItem(
      pendingKey("window-a"),
      JSON.stringify([
        { id: "ses_a1", kind: "delete", directory: "/repo" },
        { id: "ses_a2", kind: "archive", directory: null },
      ]),
    )

    await recoverPendingRemovals()

    // Both slots were taken over, but nothing was confirmed — the entries must
    // survive under this window's slot for the next start.
    expect(sdkDelete).toHaveBeenCalledTimes(1)
    expect(sdkUpdate).toHaveBeenCalledTimes(1)
    expect(window.localStorage.getItem(pendingKey("window-a"))).toBeNull()
    const retryKeys = storedSlots()
    expect(retryKeys).toHaveLength(1)
    const retried = JSON.parse(window.localStorage.getItem(retryKeys[0]) as string)
    expect(retried).toEqual([
      { id: "ses_a1", kind: "delete", directory: "/repo" },
      { id: "ses_a2", kind: "archive", directory: null },
    ])
  })

  test("drops a removal the runtime reports as already gone", async () => {
    const sdkDelete = vi.fn(async () => ({ error: { message: "Session not found" } }))
    vi.mocked(axCodeClient.getSdkClient).mockReturnValue({
      session: { delete: sdkDelete, update: vi.fn() },
    } as never)

    window.localStorage.setItem(
      pendingKey("window-a"),
      JSON.stringify([{ id: "ses_gone", kind: "delete", directory: null }]),
    )

    await recoverPendingRemovals()

    expect(storedSlots()).toHaveLength(0)
  })

  test("leaves the pending slot of another live window alone", async () => {
    // Window B is still open with S inside its undo window: committing S here
    // would delete it server-side while B's Undo still promises to restore it.
    const sdkDelete = vi.fn(async () => ({}))
    vi.mocked(axCodeClient.getSdkClient).mockReturnValue({
      session: { delete: sdkDelete, update: vi.fn() },
    } as never)

    window.localStorage.setItem(pendingKey("window-b"), JSON.stringify([{ id: "ses_b1", kind: "delete", directory: null }]))
    window.localStorage.setItem(aliveKey("window-b"), String(Date.now()))

    await recoverPendingRemovals()

    expect(sdkDelete).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(pendingKey("window-b"))).not.toBeNull()
  })

  test("takes over a slot whose window stopped heartbeating", async () => {
    const sdkDelete = vi.fn(async () => ({}))
    vi.mocked(axCodeClient.getSdkClient).mockReturnValue({
      session: { delete: sdkDelete, update: vi.fn() },
    } as never)

    window.localStorage.setItem(pendingKey("window-crashed"), JSON.stringify([{ id: "ses_c1", kind: "delete", directory: null }]))
    window.localStorage.setItem(aliveKey("window-crashed"), String(Date.now() - 60_000))

    await recoverPendingRemovals()

    expect(sdkDelete).toHaveBeenCalledWith({ sessionID: "ses_c1", directory: undefined })
    expect(window.localStorage.getItem(pendingKey("window-crashed"))).toBeNull()
  })

  test("drops an unreadable orphaned slot without touching a live window's slot", async () => {
    const sdkDelete = vi.fn(async () => ({}))
    vi.mocked(axCodeClient.getSdkClient).mockReturnValue({
      session: { delete: sdkDelete, update: vi.fn() },
    } as never)

    window.localStorage.setItem(pendingKey("window-dead"), "not json")
    window.localStorage.setItem(pendingKey("window-live"), JSON.stringify([{ id: "ses_live", kind: "delete", directory: null }]))
    window.localStorage.setItem(aliveKey("window-live"), String(Date.now()))

    await recoverPendingRemovals()

    expect(sdkDelete).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(pendingKey("window-dead"))).toBeNull()
    expect(window.localStorage.getItem(pendingKey("window-live"))).not.toBeNull()
  })

  test("recoverPendingRemovals commits and clears every window slot plus the legacy shared key", async () => {
    const sdkDelete = vi.fn(async () => ({}))
    const sdkUpdate = vi.fn(async () => ({}))
    vi.mocked(axCodeClient.getSdkClient).mockReturnValue({
      session: { delete: sdkDelete, update: sdkUpdate },
    } as never)

    window.localStorage.setItem(
      pendingKey("window-a"),
      JSON.stringify([{ id: "ses_a1", kind: "delete", directory: "/repo" }]),
    )
    window.localStorage.setItem(
      pendingKey("window-b"),
      JSON.stringify([{ id: "ses_b1", kind: "archive", directory: null }]),
    )
    // Legacy single-key layout written by older versions.
    window.localStorage.setItem(
      STORAGE_KEY_PREFIX,
      JSON.stringify([{ id: "ses_legacy", kind: "delete", directory: null }]),
    )

    await recoverPendingRemovals()

    expect(sdkDelete).toHaveBeenCalledWith({ sessionID: "ses_a1", directory: "/repo" })
    expect(sdkDelete).toHaveBeenCalledWith({ sessionID: "ses_legacy", directory: undefined })
    expect(sdkUpdate).toHaveBeenCalledWith({
      sessionID: "ses_b1",
      directory: undefined,
      time: { archived: expect.any(Number) },
    })
    expect(window.localStorage.getItem(pendingKey("window-a"))).toBeNull()
    expect(window.localStorage.getItem(pendingKey("window-b"))).toBeNull()
    expect(window.localStorage.getItem(STORAGE_KEY_PREFIX)).toBeNull()
  })
})
