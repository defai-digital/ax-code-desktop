import { setBoundedCacheEntry } from "@/lib/boundedCache"

/**
 * How many session-status events the reducer has seen per session, whether or not they changed the
 * store.
 *
 * `optimisticSend` writes `{type:"busy"}` before it posts the prompt, and its failure path must not
 * roll that back when the server published its own busy in the meantime — the turn is running and the
 * UI would show it as idle. The store cannot answer that: the reducer dedupes an equal status
 * (`areSessionStatusesEqual`) without writing, so the stored object is still the one the send wrote.
 * The count of *events* is the missing half of the signal.
 */
const statusEventsBySession = new Map<string, number>()

// Bounded like the other per-session maps in the sync layer: a client that names many sessions
// (a long list, or fabricated ids) must not grow this one entry per id.
const MAX_TRACKED_STATUS_SESSIONS = 2000

export const noteServerSessionStatus = (sessionID: string): void => {
  if (!sessionID) return
  setBoundedCacheEntry(statusEventsBySession, MAX_TRACKED_STATUS_SESSIONS, sessionID, serverSessionStatusCount(sessionID) + 1)
}

export const serverSessionStatusCount = (sessionID: string): number => statusEventsBySession.get(sessionID) ?? 0
