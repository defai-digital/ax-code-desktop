import { create } from "zustand"

import { getSafeStorage } from "@/stores/utils/safeStorage"

/**
 * Tracks, per session, when the agent last finished a run. "Finished with
 * uncommitted changes" UI (sidebar badge, chat nudge) must only fire for
 * sessions whose agent actually ran — never for pre-existing dirty state in
 * a shared directory. Timestamps persist across restarts so a ready-to-review
 * session stays marked after the app relaunches; restoring one is not a new
 * run, so only markRunEnded writes Date.now().
 */
const STORAGE_KEY = "oc.run-state.v1"
const RUN_STATE_LIMIT = 200

export interface RunStateSnapshot {
  runEndedAt: Record<string, number>
  nudgeDismissedAt: Record<string, number>
}

interface RunStateStore extends RunStateSnapshot {
  markRunEnded: (sessionId: string) => void
  dismissNudge: (sessionId: string) => void
}

const readTimestampMap = (value: unknown): Record<string, number> => {
  const map: Record<string, number> = {}
  if (value && typeof value === "object") {
    for (const [id, at] of Object.entries(value)) {
      if (typeof at === "number" && Number.isFinite(at)) map[id] = at
    }
  }
  return map
}

export function readRunState(storage: Storage): RunStateSnapshot {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return { runEndedAt: {}, nudgeDismissedAt: {} }
    const parsed = JSON.parse(raw) as Partial<RunStateSnapshot> | null
    if (!parsed || typeof parsed !== "object") return { runEndedAt: {}, nudgeDismissedAt: {} }
    return {
      runEndedAt: readTimestampMap(parsed.runEndedAt),
      nudgeDismissedAt: readTimestampMap(parsed.nudgeDismissedAt),
    }
  } catch {
    return { runEndedAt: {}, nudgeDismissedAt: {} }
  }
}

/**
 * Keep the session ids with the newest timestamp across either map so the
 * snapshot cannot grow without bound. Ties break by id ascending so the
 * result is stable; every other id is dropped from both maps.
 */
export function pruneRunState(snapshot: RunStateSnapshot, limit = RUN_STATE_LIMIT): RunStateSnapshot {
  const ids = new Set([...Object.keys(snapshot.runEndedAt), ...Object.keys(snapshot.nudgeDismissedAt)])
  if (ids.size <= limit) return snapshot
  const keep = new Set(
    [...ids]
      .map((id) => ({
        id,
        at: Math.max(snapshot.runEndedAt[id] ?? -Infinity, snapshot.nudgeDismissedAt[id] ?? -Infinity),
      }))
      .sort((left, right) => right.at - left.at || left.id.localeCompare(right.id))
      .slice(0, limit)
      .map((entry) => entry.id),
  )
  const filterMap = (map: Record<string, number>): Record<string, number> =>
    Object.fromEntries(Object.entries(map).filter(([id]) => keep.has(id)))
  return { runEndedAt: filterMap(snapshot.runEndedAt), nudgeDismissedAt: filterMap(snapshot.nudgeDismissedAt) }
}

const persist = (storage: Storage, snapshot: RunStateSnapshot): void => {
  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ runEndedAt: snapshot.runEndedAt, nudgeDismissedAt: snapshot.nudgeDismissedAt }),
    )
  } catch {
    // Storage is a convenience; the in-memory state stays authoritative.
  }
}

const safeStorage = getSafeStorage()

export const useRunStateStore = create<RunStateStore>((set, get) => {
  const update = (snapshot: RunStateSnapshot) => {
    const pruned = pruneRunState(snapshot)
    set(pruned)
    persist(safeStorage, pruned)
  }
  return {
    ...pruneRunState(readRunState(safeStorage)),

    markRunEnded: (sessionId) => {
      if (!sessionId) return
      update({
        runEndedAt: { ...get().runEndedAt, [sessionId]: Date.now() },
        nudgeDismissedAt: get().nudgeDismissedAt,
      })
    },

    dismissNudge: (sessionId) => {
      if (!sessionId) return
      update({
        runEndedAt: get().runEndedAt,
        nudgeDismissedAt: { ...get().nudgeDismissedAt, [sessionId]: Date.now() },
      })
    },
  }
})

// Imperative API for non-React code (event handler in sync-context)

export function markSessionRunEnded(sessionId: string): void {
  useRunStateStore.getState().markRunEnded(sessionId)
}

// React hooks for fine-grained subscriptions

export function useSessionRunEndedAt(sessionId: string): number | null {
  return useRunStateStore((s) => s.runEndedAt[sessionId] ?? null)
}

export function useNudgeDismissedAt(sessionId: string): number | null {
  return useRunStateStore((s) => s.nudgeDismissedAt[sessionId] ?? null)
}
