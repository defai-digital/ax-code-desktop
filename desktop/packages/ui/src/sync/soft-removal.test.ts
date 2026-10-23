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
const unarchiveSessionMock = vi.fn<(sessionId: string) => Promise<boolean>>()
const setCurrentSessionMock = vi.fn()

vi.doMock("@/components/ui", () => ({
  toast: { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
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
  unarchiveSession: unarchiveSessionMock,
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

const {
  softDeleteSession,
  softArchiveSession,
  softBulkArchive,
  softBulkDelete,
  flushPendingRemovals,
  recoverPendingRemovals,
  resetSoftRemovalForTests,
  getPendingSessionRemovalCount,
  subscribeSessionRemovals,
  hasPendingSessionRemovals,
} = await import("./soft-removal")

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
    resetSoftRemovalForTests()
    deleteSessionMock.mockReset()
    archiveSessionMock.mockReset()
    unarchiveSessionMock.mockReset()
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

  test("keeps a queued quit-recovery entry across an unrelated removal", async () => {
    // The kept entry no longer lives in the store (its pending flag was released), so a later write in
    // the same window — an unrelated removal or an undo — has to carry it. Merging it into the one write
    // meant the next launch resurrected the session whose removal had failed.
    const kept = makeSession("ses_keep", { directory: "/repo" } as Partial<Session>)
    const other = makeSession("ses_other", { directory: "/repo" } as Partial<Session>)
    useGlobalSessionsStore.getState().applySessionEvent(sessionEvent("session.created", kept))
    useGlobalSessionsStore.getState().applySessionEvent(sessionEvent("session.created", other))

    deleteSessionMock.mockResolvedValue(false)
    softDeleteSession(kept)
    flushPendingRemovals()
    await vi.waitFor(() => expect(toastErrorMock).toHaveBeenCalled())

    const owner = storedSlots()[0]?.split(".").pop() ?? ""
    const key = pendingKey(owner)
    type Persisted = { id: string }
    expect((JSON.parse(window.localStorage.getItem(key) ?? "[]") as Persisted[]).map((entry) => entry.id)).toEqual([
      "ses_keep",
    ])

    // An unrelated removal now writes this window's slot.
    softDeleteSession(other)

    const after = (JSON.parse(window.localStorage.getItem(key) ?? "[]") as Persisted[]).map((entry) => entry.id).sort()
    expect(after).toEqual(["ses_keep", "ses_other"])
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

  test("archive is sent immediately and the session.updated event fills the archived bucket", async () => {
    const session = makeSession("ses_c")
    useGlobalSessionsStore.getState().applySessionEvent(sessionEvent("session.created", session))

    archiveSessionMock.mockResolvedValue(true)
    softArchiveSession(session)
    expect(useGlobalSessionsStore.getState().activeSessions).toHaveLength(0)

    // No undo window: the request goes out without flushing or waiting for a timer.
    await vi.waitFor(() => expect(archiveSessionMock).toHaveBeenCalledWith("ses_c"))
    await vi.waitFor(() => expect(useGlobalSessionsStore.getState().pendingRemoval.size).toBe(0))
    // No manual archived-bucket write happened — the bucket is still empty
    // until the event arrives.
    expect(useGlobalSessionsStore.getState().archivedSessions).toHaveLength(0)

    const archived = makeSession("ses_c", { time: { created: 1, updated: 2, archived: 10 } } as Partial<Session>)
    useGlobalSessionsStore.getState().applySessionEvent(sessionEvent("session.updated", archived))
    expect(useGlobalSessionsStore.getState().activeSessions).toHaveLength(0)
    expect(useGlobalSessionsStore.getState().archivedSessions.map((s) => s.id)).toEqual(["ses_c"])
  })

  test("undo after an archive was sent waits for it, then unarchives", async () => {
    const session = makeSession("ses_u")
    useGlobalSessionsStore.getState().applySessionEvent(sessionEvent("session.created", session))

    let releaseArchive: (ok: boolean) => void = () => {}
    archiveSessionMock.mockImplementation(() => new Promise<boolean>((resolve) => { releaseArchive = resolve }))
    unarchiveSessionMock.mockResolvedValue(true)
    softArchiveSession(session)
    await vi.waitFor(() => expect(archiveSessionMock).toHaveBeenCalled())

    const options = toastSuccessMock.mock.calls.at(-1)?.[1] as { action?: { onClick?: () => void } } | undefined
    options?.action?.onClick?.()
    await new Promise((resolve) => setTimeout(resolve, 0))
    // The unarchive must not overtake the archive it reverses.
    expect(unarchiveSessionMock).not.toHaveBeenCalled()

    releaseArchive(true)
    await vi.waitFor(() => expect(unarchiveSessionMock).toHaveBeenCalledWith("ses_u"))
  })

  test("undo after a failed archive does not unarchive; the rollback already restored the session", async () => {
    const session = makeSession("ses_f")
    useGlobalSessionsStore.getState().applySessionEvent(sessionEvent("session.created", session))

    let releaseArchive: (ok: boolean) => void = () => {}
    archiveSessionMock.mockImplementation(() => new Promise<boolean>((resolve) => { releaseArchive = resolve }))
    softArchiveSession(session)
    await vi.waitFor(() => expect(archiveSessionMock).toHaveBeenCalled())

    const options = toastSuccessMock.mock.calls.at(-1)?.[1] as { action?: { onClick?: () => void } } | undefined
    options?.action?.onClick?.()
    releaseArchive(false)

    await vi.waitFor(() => expect(toastErrorMock).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(unarchiveSessionMock).not.toHaveBeenCalled()
    expect(useGlobalSessionsStore.getState().activeSessions.map((s) => s.id)).toEqual(["ses_f"])
  })

  test("undo reverses a successful archive even if an active snapshot arrived before acknowledgement", async () => {
    const session = makeSession("ses_active_snapshot")
    useGlobalSessionsStore.getState().applySessionEvent(sessionEvent("session.created", session))
    archiveSessionMock.mockImplementation(async () => {
      useGlobalSessionsStore.getState().applySessionEvent(sessionEvent("session.updated", session))
      return true
    })
    unarchiveSessionMock.mockResolvedValue(true)
    softArchiveSession(session)
    await vi.waitFor(() => expect(getPendingSessionRemovalCount()).toBe(0))
    const options = toastSuccessMock.mock.calls.at(-1)?.[1] as unknown as { action: { onClick: () => void } }
    options.action.onClick()
    await vi.waitFor(() => expect(unarchiveSessionMock).toHaveBeenCalledWith(session.id))
  })

  test("an archive event before acknowledgement is accepted", async () => {
    const session = makeSession("ses_early_event")
    useGlobalSessionsStore.getState().applySessionEvent(sessionEvent("session.created", session))
    archiveSessionMock.mockImplementation(async () => {
      useGlobalSessionsStore.getState().applySessionEvent(sessionEvent("session.updated", {
        ...session, time: { ...session.time, updated: 3, archived: 3 },
      }))
      return true
    })
    softArchiveSession(session)
    await vi.waitFor(() => expect(getPendingSessionRemovalCount()).toBe(0))
    expect(useGlobalSessionsStore.getState().archivedSessions.map((item) => item.id)).toContain(session.id)
  })

  test("an archive Undo is one-shot and cannot reverse a later archive", async () => {
    const session = makeSession("ses_epoch")
    useGlobalSessionsStore.getState().applySessionEvent(sessionEvent("session.created", session))
    archiveSessionMock.mockResolvedValue(true)
    unarchiveSessionMock.mockResolvedValue(true)
    softArchiveSession(session)
    await vi.waitFor(() => expect(getPendingSessionRemovalCount()).toBe(0))
    const first = toastSuccessMock.mock.calls.at(-1)?.[1] as unknown as { action: { onClick: () => void } }
    softArchiveSession(session)
    await vi.waitFor(() => expect(archiveSessionMock).toHaveBeenCalledTimes(2))
    first.action.onClick()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(unarchiveSessionMock).not.toHaveBeenCalled()
    const second = toastSuccessMock.mock.calls.at(-1)?.[1] as unknown as { action: { onClick: () => void } }
    second.action.onClick()
    second.action.onClick()
    await vi.waitFor(() => expect(unarchiveSessionMock).toHaveBeenCalledTimes(1))
  })

  test("a new archive waits for the previous unarchive acknowledgement", async () => {
    const session = makeSession("ses_undo_then_archive")
    useGlobalSessionsStore.getState().applySessionEvent(sessionEvent("session.created", session))
    archiveSessionMock.mockResolvedValue(true)
    let release: (ok: boolean) => void = () => {}
    unarchiveSessionMock.mockImplementation(() => new Promise<boolean>((resolve) => { release = resolve }))
    softArchiveSession(session)
    await vi.waitFor(() => expect(getPendingSessionRemovalCount()).toBe(0))
    const options = toastSuccessMock.mock.calls.at(-1)?.[1] as unknown as { action: { onClick: () => void } }
    options.action.onClick()
    await vi.waitFor(() => expect(unarchiveSessionMock).toHaveBeenCalled())
    useGlobalSessionsStore.getState().applySessionEvent(sessionEvent("session.updated", session))
    softArchiveSession(session)
    expect(archiveSessionMock).toHaveBeenCalledTimes(1)
    release(true)
    await vi.waitFor(() => expect(archiveSessionMock).toHaveBeenCalledTimes(2))
  })

  test("bulk undo keeps reversing later sessions when one unarchive fails", async () => {
    const sessions = [makeSession("ses_undo_fail_a"), makeSession("ses_undo_fail_b")]
    for (const session of sessions) {
      useGlobalSessionsStore.getState().applySessionEvent(sessionEvent("session.created", session))
    }
    archiveSessionMock.mockResolvedValue(true)
    unarchiveSessionMock.mockImplementation(async (id: string) => {
      if (id === "ses_undo_fail_a") throw new Error("unarchive refused")
      return true
    })
    softBulkArchive(sessions)
    await vi.waitFor(() => expect(getPendingSessionRemovalCount()).toBe(0))
    const options = toastSuccessMock.mock.calls.at(-1)?.[1] as unknown as { action: { onClick: () => void } }
    options.action.onClick()

    // The failed unarchive must not stop the batch: the second session is still reversed,
    // and the failure is reported once instead of silently swallowing the remaining undos.
    await vi.waitFor(() => expect(unarchiveSessionMock).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith("sessions.sidebar.session.unarchive.error"))
  })

  test("commits a bulk removal one request at a time so rate-limit retries cannot stampede", async () => {
    const sessions = [makeSession("ses_serial_1"), makeSession("ses_serial_2")]
    for (const session of sessions) {
      useGlobalSessionsStore.getState().applySessionEvent(sessionEvent("session.created", session))
    }

    let inFlight = 0
    let maxInFlight = 0
    deleteSessionMock.mockImplementation(async () => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 0))
      inFlight -= 1
      return true
    })

    softBulkDelete(sessions)
    flushPendingRemovals()

    await vi.waitFor(() => expect(deleteSessionMock).toHaveBeenCalledTimes(2))
    expect(maxInFlight).toBe(1)
  })

  test("keeps every unconfirmed bulk removal durable across another removal and undo", async () => {
    const sessions = [makeSession("ses_waiting_1"), makeSession("ses_waiting_2")]
    let release: (ok: boolean) => void = () => {}
    deleteSessionMock.mockImplementationOnce(() => new Promise<boolean>((resolve) => { release = resolve }))
    deleteSessionMock.mockResolvedValue(true)
    softBulkDelete(sessions)
    flushPendingRemovals()

    softDeleteSession(makeSession("ses_unrelated"))
    const action = toastSuccessMock.mock.calls.at(-1)?.[1]?.action as unknown as { onClick: () => void }
    action.onClick()
    const ids = storedSlots().flatMap((key) =>
      (JSON.parse(window.localStorage.getItem(key) ?? "[]") as { id: string }[]).map((entry) => entry.id),
    )
    release(true)
    await vi.waitFor(() => expect(deleteSessionMock).toHaveBeenCalledTimes(2))
    expect(ids.sort()).toEqual(["ses_waiting_1", "ses_waiting_2"])
  })

  test("persists adopted recovery work before sending its first request", async () => {
    let release: (value: object) => void = () => {}
    const sdkDelete = vi.fn(() => new Promise<object>((resolve) => { release = resolve }))
    vi.mocked(axCodeClient.getSdkClient).mockReturnValue({ session: { delete: sdkDelete, update: vi.fn() } } as never)
    window.localStorage.setItem(pendingKey("crashed-window"), JSON.stringify([
      { id: "ses_adopted", kind: "delete", directory: "/repo" },
    ]))

    const recovering = recoverPendingRemovals()
    const records = storedSlots().flatMap((key) => JSON.parse(window.localStorage.getItem(key) ?? "[]"))
    // Recovery is already committing this id; a new Undo promise would be false.
    softDeleteSession(makeSession("ses_adopted"))
    expect(toastSuccessMock).not.toHaveBeenCalled()
    expect(useGlobalSessionsStore.getState().pendingRemoval.size).toBe(0)
    release({})
    await recovering
    expect(records).toContainEqual({ id: "ses_adopted", kind: "delete", directory: "/repo" })
    expect(storedSlots()).toEqual([])
  })

  test("preserves orphaned recovery work when its durable takeover write fails", async () => {
    const key = pendingKey("crashed-window")
    window.localStorage.setItem(key, JSON.stringify([{ id: "ses_retry", kind: "delete", directory: null }]))
    const sdkDelete = vi.fn(async () => ({}))
    vi.mocked(axCodeClient.getSdkClient).mockReturnValue({ session: { delete: sdkDelete, update: vi.fn() } } as never)
    const write = vi.spyOn(Object.getPrototypeOf(window.localStorage), "setItem").mockImplementation(() => { throw new Error("quota exceeded") })
    try {
      await recoverPendingRemovals()
      expect(write).toHaveBeenCalled()
      expect(window.localStorage.getItem(key)).not.toBeNull()
      expect(sdkDelete).not.toHaveBeenCalled()
    } finally {
      write.mockRestore()
    }
  })

  test("reports a rejected commit and releases its in-flight protection", async () => {
    vi.useFakeTimers()
    try {
      const session = makeSession("ses_throw")
      deleteSessionMock.mockRejectedValue(new Error("unexpected transport rejection"))
      softDeleteSession(session)
      await vi.advanceTimersByTimeAsync(7000)
      expect(toastErrorMock).toHaveBeenCalled()
      expect(useGlobalSessionsStore.getState().activeSessions.map((entry) => entry.id)).toContain("ses_throw")
      expect(hasPendingSessionRemovals()).toBe(false)
      expect(storedSlots()).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })

  test("retains a failed delete when another orphaned slot also requested archive", async () => {
    const sdkDelete = vi.fn(async () => ({ error: { message: "offline" } }))
    const sdkUpdate = vi.fn(async () => ({}))
    vi.mocked(axCodeClient.getSdkClient).mockReturnValue({ session: { delete: sdkDelete, update: sdkUpdate } } as never)
    window.localStorage.setItem(pendingKey("delete-window"), JSON.stringify([{ id: "ses_conflict", kind: "delete", directory: null }]))
    window.localStorage.setItem(pendingKey("archive-window"), JSON.stringify([{ id: "ses_conflict", kind: "archive", directory: null }]))
    await recoverPendingRemovals()
    expect(sdkDelete).toHaveBeenCalledTimes(1)
    expect(sdkUpdate).not.toHaveBeenCalled()
    const records = storedSlots().flatMap((key) => JSON.parse(window.localStorage.getItem(key) ?? "[]"))
    expect(records).toEqual([{ id: "ses_conflict", kind: "delete", directory: null }])
  })

  test("notifies retention when recovery drains even if a failed record remains durable", async () => {
    let release: (value: object) => void = () => {}
    vi.mocked(axCodeClient.getSdkClient).mockReturnValue({
      session: { delete: vi.fn(() => new Promise<object>((resolve) => { release = resolve })), update: vi.fn() },
    } as never)
    window.localStorage.setItem(pendingKey("crashed-window"), JSON.stringify([{ id: "ses_wait", kind: "delete", directory: null }]))
    const counts: number[] = []
    const unsubscribe = subscribeSessionRemovals(() => counts.push(getPendingSessionRemovalCount()))
    try {
      const recovering = recoverPendingRemovals()
      expect(hasPendingSessionRemovals()).toBe(true)
      release({ error: { message: "offline" } })
      await recovering
      expect(counts).toEqual([1, 0])
      expect(hasPendingSessionRemovals()).toBe(false)
      expect(storedSlots()).toHaveLength(1)
    } finally {
      unsubscribe()
    }
  })

  test("recovers orphaned removals one request at a time so rate-limit retries cannot stampede", async () => {
    let inFlight = 0
    let maxInFlight = 0
    const sdkDelete = vi.fn(async () => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 0))
      inFlight -= 1
      return {}
    })
    vi.mocked(axCodeClient.getSdkClient).mockReturnValue({
      session: { delete: sdkDelete, update: vi.fn(async () => ({})) },
    } as never)

    window.localStorage.setItem(
      pendingKey("window-a"),
      JSON.stringify([
        { id: "ses_r1", kind: "delete", directory: null },
        { id: "ses_r2", kind: "delete", directory: null },
      ]),
    )

    await recoverPendingRemovals()

    expect(sdkDelete).toHaveBeenCalledTimes(2)
    expect(maxInFlight).toBe(1)
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

  test("keeps a removal the user made while the recovery was in flight", async () => {
    // The recovery ends by writing its own leftovers over the whole slot, so a soft-delete made while
    // its requests were in flight vanished from quit recovery: a crash inside that undo window left the
    // session alive again on the next launch.
    let releaseRecovery: (value: unknown) => void = () => {}
    const inFlight = new Promise((resolve) => {
      releaseRecovery = resolve
    })
    const sdkDelete = vi.fn(() => inFlight.then(() => ({})))
    vi.mocked(axCodeClient.getSdkClient).mockReturnValue({
      session: { delete: sdkDelete, update: vi.fn(async () => ({})) },
    } as never)

    window.localStorage.setItem(
      pendingKey("window-a"),
      JSON.stringify([{ id: "ses_recovered", kind: "delete", directory: null }]),
    )

    const recovery = recoverPendingRemovals()
    await Promise.resolve()
    softDeleteSession(makeSession("ses_new"))
    releaseRecovery({})
    await recovery

    const entries = storedSlots().flatMap((key) => JSON.parse(window.localStorage.getItem(key) as string))
    expect(entries.map((entry: { id: string }) => entry.id)).toContain("ses_new")
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
