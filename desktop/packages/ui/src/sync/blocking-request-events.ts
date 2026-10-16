import { setBoundedCacheEntry } from "@/lib/boundedCache"

/**
 * The stamp of the last question/permission event the reducer saw for a session, whether or not the event
 * changed the store.
 *
 * The resync paths compare it around their snapshot request: a question asked *and answered* while the
 * request is in flight leaves the id list back where it started, so the signature comparison alone cannot
 * tell that the answer they are about to apply is older than the store. The stamp lives here rather than
 * in the store because a draft is discarded whenever the reducer reports no change — a `question.replied`
 * for a question this client never saw is exactly that case.
 */
const blockingRequestsBySession = new Map<string, number>()

// Bounded like the other per-session maps in the sync layer: a client that names many sessions
// (a long list, or fabricated ids) must not grow this one entry per id.
const MAX_TRACKED_BLOCKING_SESSIONS = 2000

// Shared by every session, so an evicted entry's replacement stamp is never the value an in-flight
// request recorded.
let blockingRequestStampSequence = 0

export const noteBlockingRequestEvent = (sessionID: string): void => {
  if (!sessionID) return
  blockingRequestStampSequence += 1
  setBoundedCacheEntry(blockingRequestsBySession, MAX_TRACKED_BLOCKING_SESSIONS, sessionID, blockingRequestStampSequence)
}

export const blockingRequestStamp = (sessionID: string): number => blockingRequestsBySession.get(sessionID) ?? 0

/**
 * The stamp any session without an entry of its own would have had at this moment.
 *
 * A caller captures this before its request: a session that had no entry then cannot have been changed by
 * an event, so its own stamp staying at or below the floor means "nothing arrived for it", while a stamp
 * above it means an event bumped it (which is also how a reply for a session the store never held is
 * seen). Comparing such a session against 0 instead compared it against every event it had ever seen.
 */
export const blockingRequestStampFloor = (): number => blockingRequestStampSequence
