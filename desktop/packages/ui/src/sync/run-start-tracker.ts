import { setBoundedCacheEntry } from "@/lib/boundedCache"

/**
 * When the run that is in progress for a session began, as the renderer saw it. Used to tell an error from an earlier
 * run (superseded once a later run completes) from an error inside the run that just ended (still the user's to see).
 *
 * Only a run observed from its start is tracked: a session already busy when the app attached has no entry, so a
 * completion we cannot place never clears an error. Bounded like the other per-session maps in the sync layer.
 */
const runStartedAt = new Map<string, number>()
const MAX_TRACKED_RUNS = 2000

/** Records the first running status of a run. A repeated busy or retry inside the same run keeps its start. */
export function noteSessionRunStatus(sessionId: string, statusType: string | undefined, now: number = Date.now()): void {
  if (!sessionId) return
  if (statusType === "idle") return
  if (statusType !== "busy" && statusType !== "retry") return
  if (runStartedAt.has(sessionId)) return
  setBoundedCacheEntry(runStartedAt, MAX_TRACKED_RUNS, sessionId, now)
}

/** Returns when the run that just ended began, or null when it was not observed from its start. Forgets it. */
export function takeSessionRunStartedAt(sessionId: string): number | null {
  const startedAt = runStartedAt.get(sessionId)
  runStartedAt.delete(sessionId)
  return startedAt ?? null
}
