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
