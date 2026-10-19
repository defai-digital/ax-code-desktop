import { create } from "zustand"
import { defineStore } from "@/lib/store-registry"
import { goalRevision, type SessionGoalSnapshot } from "@/lib/supervision/goal"

/**
 * Runtime goals by session id, for supervision rows. Memory only: the runtime owns the goal, and this store is a
 * projection of its route and event. Nothing here is persisted or sent anywhere.
 *
 * Event writes are authoritative and ordered by the stream. A route read can have started before an event that
 * arrived while it was in flight, so a read applies only when no event touched that session since the read began.
 */
export interface SessionGoalStore {
  goals: Record<string, SessionGoalSnapshot>
  /** Sessions whose goal is known, including those the runtime reported as having none. */
  known: Record<string, true>
  /** Per-session count of event writes, used to discard a stale route read. */
  eventSeq: Record<string, number>
  /** Apply a `session.goal` event. A null goal clears the entry; an older revision of the same goal is ignored. */
  applyEvent: (sessionId: string, goal: SessionGoalSnapshot | null) => void
  /** Token to pass to applyRead for a route read about to start. */
  beginRead: (sessionId: string) => number
  /** Apply a route read; returns false when an event arrived since beginRead and the read was discarded. */
  applyRead: (sessionId: string, goal: SessionGoalSnapshot | null, token: number) => boolean
  /** Forget a session (deleted, or its directory store was removed). */
  remove: (sessionId: string) => void
  clear: () => void
}

const without = <T,>(record: Record<string, T>, key: string): Record<string, T> => {
  if (!Object.hasOwn(record, key)) return record
  const next = { ...record }
  delete next[key]
  return next
}

export const useSessionGoalStore = defineStore(
  "useSessionGoalStore",
  { domain: "supervision", tier: "live" },
  create<SessionGoalStore>()((set, get) => ({
    goals: {},
    known: {},
    eventSeq: {},
    applyEvent: (sessionId, goal) => {
      const state = get()
      const seq = { ...state.eventSeq, [sessionId]: (state.eventSeq[sessionId] ?? 0) + 1 }
      if (!goal) {
        set({ goals: without(state.goals, sessionId), known: { ...state.known, [sessionId]: true }, eventSeq: seq })
        return
      }
      const current = state.goals[sessionId]
      if (current && goalRevision(goal) < goalRevision(current)) {
        set({ eventSeq: seq })
        return
      }
      set({ goals: { ...state.goals, [sessionId]: goal }, known: { ...state.known, [sessionId]: true }, eventSeq: seq })
    },
    beginRead: (sessionId) => get().eventSeq[sessionId] ?? 0,
    applyRead: (sessionId, goal, token) => {
      const state = get()
      if ((state.eventSeq[sessionId] ?? 0) !== token) return false
      set({
        goals: goal ? { ...state.goals, [sessionId]: goal } : without(state.goals, sessionId),
        known: { ...state.known, [sessionId]: true },
      })
      return true
    },
    remove: (sessionId) => {
      const state = get()
      set({
        goals: without(state.goals, sessionId),
        known: without(state.known, sessionId),
        eventSeq: without(state.eventSeq, sessionId),
      })
    },
    clear: () => set({ goals: {}, known: {}, eventSeq: {} }),
  })),
)

/** The goal for one session, or null; re-renders only when that goal changes. */
export function useSessionGoal(sessionId: string | null | undefined): SessionGoalSnapshot | null {
  return useSessionGoalStore((state) => (sessionId ? (state.goals[sessionId] ?? null) : null))
}
