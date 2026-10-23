import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { Session } from "@defai-digital/ax-code-sdk/v2"

/**
 * Model 2: soft-removal per-window slots and recovery.
 *
 * Seeded interleavings of remove / undo / flush(commit) / quit-recovery over
 * two sessions, driven against the real module and the real global sessions
 * store (only the SDK, toast and i18n edges are mocked, as in
 * soft-removal.test.ts). Invariants: a pending removal is hidden; a failed
 * commit restores the session and keeps its recovery entry; an undone or
 * confirmed removal leaves no recovery entry; recovery of a dead window's
 * slot drops confirmed/gone entries and writes failures back.
 */

const deleteSessionMock = vi.fn<(sessionId: string) => Promise<boolean>>()
const archiveSessionMock = vi.fn<(sessionId: string) => Promise<boolean>>()
const recoverDeleteMock = vi.fn()
const recoverUpdateMock = vi.fn()

vi.doMock("@/components/ui", () => ({
  toast: { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}))
vi.doMock("@/lib/ax-code/client", () => ({
  axCodeClient: {
    getSdkClient: vi.fn(() => ({
      session: { delete: recoverDeleteMock, update: recoverUpdateMock },
    })),
    getScopedSdkClient: vi.fn(),
  },
}))
vi.doMock("@/sync/session-ui-store", () => ({
  useSessionUIStore: {
    getState: () => ({ currentSessionId: null, setCurrentSession: vi.fn() }),
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
import { createRng, runPropertyAsync, type Rng } from "../../test/prng"

const { toast } = await import("@/components/ui")
const {
  softDeleteSession,
  flushPendingRemovals,
  recoverPendingRemovals,
  resetSoftRemovalForTests,
} = await import("../soft-removal")

const toastSuccessMock = vi.mocked(toast.success)
const STORAGE_KEY_PREFIX = "axcode.pending-session-removals"
const SESSION_IDS = ["ses_a", "ses_b"] as const

const makeSession = (id: string): Session =>
  ({ id, title: `Session ${id}`, time: { created: 1, updated: 2 }, directory: "/repo" }) as Session

function resetStore() {
  useGlobalSessionsStore.setState({
    activeSessions: [],
    archivedSessions: [],
    sessionsByDirectory: new Map(),
    pendingRemoval: new Map(),
    hasLoaded: true,
    status: "ready",
  })
}

function slotIds(): string[] {
  const ids: string[] = []
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i)
    if (!key?.startsWith(`${STORAGE_KEY_PREFIX}.pending.`)) continue
    try {
      const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]") as Array<{ id: string }>
      for (const entry of parsed) ids.push(entry.id)
    } catch {
      // ignore
    }
  }
  return ids.sort()
}

type Op =
  | { kind: "remove"; id: string; removal: "delete" }
  | { kind: "undo" }
  | { kind: "flush"; ok: boolean }
  | { kind: "recover"; id: string; outcome: "ok" | "fail" | "gone" }
  | { kind: "recoverRace"; id: string }
  | { kind: "renameDuringFailedCommit"; id: string }

function generateTrace(rng: Rng): Op[] {
  const ops: Op[] = []
  for (let i = 0, n = 3 + rng.int(4); i < n; i += 1) {
    const id = rng.pick(SESSION_IDS)
    switch (rng.int(6)) {
      case 0:
        ops.push({ kind: "remove", id, removal: "delete" })
        break
      case 1:
        ops.push({ kind: "undo" })
        break
      case 2:
        ops.push({ kind: "flush", ok: rng.chance(0.6) })
        break
      case 3:
        ops.push({ kind: "recover", id, outcome: rng.pick(["ok", "fail", "gone"] as const) })
        break
      case 4:
        ops.push({ kind: "recoverRace", id })
        break
      default:
        ops.push({ kind: "renameDuringFailedCommit", id })
        break
    }
  }
  return ops
}

async function settleFlush() {
  flushPendingRemovals()
  // Fake timers: advancing by 0 flushes the microtask queue that the
  // fire-and-forget commit chain runs on. No real polling or sleeps.
  await vi.advanceTimersByTimeAsync(0)
  await vi.advanceTimersByTimeAsync(0)
  expect(useGlobalSessionsStore.getState().pendingRemoval.size).toBe(0)
}

describe("soft-removal model", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    window.localStorage.clear()
    resetStore()
    resetSoftRemovalForTests()
    deleteSessionMock.mockReset()
    archiveSessionMock.mockReset()
    recoverDeleteMock.mockReset()
    recoverUpdateMock.mockReset()
    toastSuccessMock.mockClear()
    vi.mocked(toast.error).mockClear()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  test("per-window slot, undo/commit ordering and quit-recovery invariants", async () => {
    await runPropertyAsync({
      name: "soft-removal slot model",
      cases: 30,
      seed: 1201,
      generate: generateTrace,
      check: async (trace) => {
        // Drain any commit still settling from the previous case before
        // resetting, so its late persist cannot leak into this case's slot.
        deleteSessionMock.mockResolvedValue(true)
        archiveSessionMock.mockResolvedValue(true)
        flushPendingRemovals()
        await vi.advanceTimersByTimeAsync(0)
        await vi.advanceTimersByTimeAsync(0)
        window.localStorage.clear()
        resetStore()
        resetSoftRemovalForTests()
        deleteSessionMock.mockReset()
        archiveSessionMock.mockReset()
        toastSuccessMock.mockClear()
        vi.mocked(toast.error).mockClear()

        // Independent model of the observable contract.
        const present = new Set<string>()
        const pending = new Set<string>()
        const kept = new Set<string>()
        // The toast Undo action restores only the ids of the removal that
        // raised that toast, not every pending removal.
        let lastUndoable: string[] = []

        const addSession = (id: string) => {
          useGlobalSessionsStore
            .getState()
            .applySessionEvent({ type: "session.created", properties: { info: makeSession(id) } })
          present.add(id)
        }
        for (const id of SESSION_IDS) addSession(id)

        const assertEndState = (step = "?") => {
          const state = useGlobalSessionsStore.getState()
          for (const id of SESSION_IDS) {
            const visible =
              state.activeSessions.some((s) => s.id === id) || state.archivedSessions.some((s) => s.id === id)
            if (visible !== present.has(id)) {
              throw new Error(`${id} visibility=${visible}, expected present=${present.has(id)}`)
            }
            if (pending.has(id) && visible) throw new Error(`${id} pending but visible`)
          }
          const expectedSlot = [...new Set([...pending, ...kept])].sort()
          const actualSlot = slotIds()
          if (JSON.stringify(actualSlot) !== JSON.stringify(expectedSlot)) {
            const dump: string[] = []
            for (let i = 0; i < window.localStorage.length; i += 1) {
              const key = window.localStorage.key(i)
              if (key) dump.push(`${key}=${window.localStorage.getItem(key)}`)
            }
            throw new Error(
              `after ${step}: slot=${JSON.stringify(actualSlot)}, expected=${JSON.stringify(expectedSlot)}; storage: ${dump.join(" | ")}`,
            )
          }
        }

        for (const op of trace) {
          if (op.kind === "remove") {
            if (!present.has(op.id) || pending.has(op.id)) continue
            // Only delete waits in an undo window; archive is sent at once and is covered in soft-removal.test.ts.
            softDeleteSession(makeSession(op.id))
            lastUndoable = [op.id]
            pending.add(op.id)
            present.delete(op.id)
            // Hidden instantly, before any commit.
            expect(useGlobalSessionsStore.getState().activeSessions.some((s) => s.id === op.id)).toBe(false)
          } else if (op.kind === "undo") {
            const calls = toastSuccessMock.mock.calls
            const options = calls[calls.length - 1]?.[1] as { action?: { onClick?: () => void } } | undefined
            if (!options?.action?.onClick || pending.size === 0) continue
            options.action.onClick()
            for (const id of lastUndoable) {
              if (!pending.has(id)) continue
              pending.delete(id)
              kept.delete(id)
              present.add(id)
            }
            lastUndoable = []
          } else if (op.kind === "flush") {
            if (pending.size === 0) continue
            deleteSessionMock.mockResolvedValue(op.ok)
            archiveSessionMock.mockResolvedValue(op.ok)
            const flushed = [...pending]
            await settleFlush()
            for (const id of flushed) {
              pending.delete(id)
              if (op.ok) {
                kept.delete(id)
              } else {
                kept.add(id)
                present.add(id)
              }
            }
          } else if (op.kind === "recover") {
            // A dead window left this entry behind; this window takes it over.
            window.localStorage.setItem(
              `${STORAGE_KEY_PREFIX}.pending.deadwindow`,
              JSON.stringify([{ id: op.id, kind: "delete", directory: "/repo" }]),
            )
            recoverDeleteMock.mockResolvedValue(
              op.outcome === "ok"
                ? { data: {} }
                : op.outcome === "gone"
                  ? { error: { message: "Session not found" } }
                  : { error: { message: "server boom" } },
            )
            recoverUpdateMock.mockResolvedValue({ data: {} })
            await recoverPendingRemovals()
            // Recovery settles only the dead window's entry: a failure is
            // written back into this window's slot, while a confirmed/gone
            // entry confirms any older same-id kept record too. Unrelated
            // pending removals remain untouched.
            if (op.outcome === "fail") kept.add(op.id)
            else kept.delete(op.id)
          } else if (op.kind === "recoverRace") {
            // In-flight-removal-during-recovery race (commit 031e86b5):
            // recovery starts and is NOT awaited while the user removes
            // another session; recovery's final persist must not drop the
            // removal made in flight.
            window.localStorage.setItem(
              `${STORAGE_KEY_PREFIX}.pending.deadwindow`,
              JSON.stringify([{ id: op.id, kind: "delete", directory: "/repo" }]),
            )
            let releaseRecovery: (value: unknown) => void = () => {}
            const inFlightRecovery = new Promise((resolve) => {
              releaseRecovery = resolve
            })
            recoverDeleteMock.mockImplementation(() => inFlightRecovery.then(() => ({ data: {} })))
            recoverUpdateMock.mockResolvedValue({ data: {} })
            const recovery = recoverPendingRemovals()
            await vi.advanceTimersByTimeAsync(0)
            // An already committing recovery cannot offer another undo window
            // for the same id. This scenario removes a different session.
            const target = SESSION_IDS.find((id) => id !== op.id && present.has(id) && !pending.has(id))
            if (target) {
              softDeleteSession(makeSession(target))
              lastUndoable = [target]
              pending.add(target)
              present.delete(target)
            }
            releaseRecovery({})
            await recovery
            kept.delete(op.id)
            recoverDeleteMock.mockReset()
          } else {
            // renameDuringFailedCommit: a newer event lands mid-commit and
            // the failed rollback must not replace it with the snapshot.
            if (!present.has(op.id) || pending.has(op.id)) continue
            // The flush inside this scenario commits every pending removal,
            // so settle any others first (as a confirmed commit).
            if (pending.size > 0) {
              deleteSessionMock.mockResolvedValue(true)
              archiveSessionMock.mockResolvedValue(true)
              const flushed = [...pending]
              await settleFlush()
              for (const id of flushed) {
                pending.delete(id)
                kept.delete(id)
              }
            }
            const deleteControl: { resolve: ((value: boolean) => void) | null } = { resolve: null }
            deleteSessionMock.mockImplementation(
              () =>
                new Promise<boolean>((resolve) => {
                  deleteControl.resolve = resolve
                }),
            )
            softDeleteSession(makeSession(op.id))
            pending.add(op.id)
            present.delete(op.id)
            flushPendingRemovals()
            await vi.advanceTimersByTimeAsync(0)
            expect(useGlobalSessionsStore.getState().pendingRemoval.size).toBe(0)
            const renamed = { ...makeSession(op.id), title: "renamed", time: { created: 1, updated: 99 } } as Session
            useGlobalSessionsStore
              .getState()
              .applySessionEvent({ type: "session.updated", properties: { info: renamed } })
            vi.mocked(toast.error).mockClear()
            deleteControl.resolve?.(false)
            // Let this commit's tail (slot persist, rollback, failure
            // toast) run to completion on the microtask queue.
            await vi.advanceTimersByTimeAsync(0)
            await vi.advanceTimersByTimeAsync(0)
            if (!slotIds().includes(op.id)) throw new Error("commit not settled yet")
            expect(vi.mocked(toast.error)).toHaveBeenCalled()
            pending.delete(op.id)
            kept.add(op.id)
            present.add(op.id)
            const entry = useGlobalSessionsStore.getState().activeSessions.find((s) => s.id === op.id)
            if (entry?.title !== "renamed") {
              throw new Error(`failed commit replaced newer entry for ${op.id}: title=${entry?.title}`)
            }
          }
          assertEndState(JSON.stringify(op))
        }

        // Drain so no 7s undo timer or in-flight commit leaks onwards.
        deleteSessionMock.mockResolvedValue(true)
        archiveSessionMock.mockResolvedValue(true)
        await settleFlush()
        await vi.advanceTimersByTimeAsync(0)
      },
    })
  })

  test("generator determinism", () => {
    expect(generateTrace(createRng(4))).toEqual(generateTrace(createRng(4)))
  })
})
