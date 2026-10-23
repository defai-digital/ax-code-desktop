import { setBoundedCacheEntry } from "@/lib/boundedCache"

/**
 * The stamp of the last session-status event the reducer saw for a session, whether or not the event
 * changed the store. Stamps come from one counter shared by every session, so no two events carry the
 * same one — not even across the bounded map's eviction.
 *
 * `optimisticSend` writes `{type:"busy"}` before it posts the prompt, and its failure path must not
 * roll that back when the server published its own busy in the meantime — the turn is running and the
 * UI would show it as idle. The store cannot answer that: the reducer dedupes an equal status
 * (`areSessionStatusesEqual`) without writing, so the stored object is still the one the send wrote.
 * The stamp of the last event is the missing half of the signal.
 */
const statusEventsBySession = new Map<string, number>()

// Bounded like the other per-session maps in the sync layer: a client that names many sessions
// (a long list, or fabricated ids) must not grow this one entry per id.
const MAX_TRACKED_STATUS_SESSIONS = 2000

// Shared by every session so that an evicted entry's replacement stamp is never the value an
// in-flight send recorded: a per-session counter that restarted at 1 could match the 1 a send
// captured and roll a running turn back to idle.
let statusEventStamp = 0

export const noteServerSessionStatus = (sessionID: string): void => {
  if (!sessionID) return
  statusEventStamp += 1
  setBoundedCacheEntry(statusEventsBySession, MAX_TRACKED_STATUS_SESSIONS, sessionID, statusEventStamp)
}

export const serverSessionStatusStamp = (sessionID: string): number => statusEventsBySession.get(sessionID) ?? 0

export const serverSessionStatusStampFloor = (): number => statusEventStamp
