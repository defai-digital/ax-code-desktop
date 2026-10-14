/**
 * Keeps the server's auto-accept suppression in step with the UI.
 *
 * The server suppresses permission notifications for sessions it believes are
 * auto-accepting, so a POST that is dropped (network error, 5xx) or delivered out
 * of order leaves the two sides disagreeing: the client stops auto-responding
 * while the server keeps the stream quiet, and an unattended agent waits forever.
 * This helper therefore
 *  - treats a non-2xx response as a failure (the old code only caught network
 *    rejections),
 *  - keeps the desired value pending until it is confirmed, retrying with a
 *    bounded backoff,
 *  - serialises sends per session so a quick on/off/on ends on the last value,
 *  - exposes flushPending() so a rehydrate or a reconnect replays the full
 *    effective map — including the `false` entries that used to be dropped.
 */

export type AutoAcceptSyncDeps = {
  post: (sessionId: string, enabled: boolean) => Promise<{ ok: boolean } | void>
  schedule?: (callback: () => void, delayMs: number) => unknown
  logger?: Pick<Console, "warn">
  retryDelaysMs?: readonly number[]
}

export const createAutoAcceptSync = ({
  post,
  schedule = (callback, delayMs) => setTimeout(callback, delayMs),
  logger = console,
  retryDelaysMs = [500, 2_000, 5_000],
}: AutoAcceptSyncDeps) => {
  // Desired value per session that has not been confirmed yet.
  const pending = new Map<string, boolean>()
  const chainBySession = new Map<string, Promise<void>>()
  const retriesBySession = new Map<string, number>()

  const send = async (sessionId: string, enabled: boolean): Promise<boolean> => {
    try {
      const response = await post(sessionId, enabled)
      // A caller that returns a response object must report ok === true; a bare
      // resolved promise counts as success (the fetch wrapper's own contract).
      if (response && typeof response === "object" && "ok" in response && response.ok !== true) {
        return false
      }
      return true
    } catch (error) {
      logger.warn?.(`[auto-accept] failed to notify the server for ${sessionId}:`, error)
      return false
    }
  }

  const scheduleRetry = (sessionId: string) => {
    const attempt = retriesBySession.get(sessionId) ?? 0
    if (attempt >= retryDelaysMs.length) {
      // Out of attempts: keep the value pending so the next flush (rehydrate,
      // reconnect, or another toggle) retries it instead of losing it.
      return
    }
    retriesBySession.set(sessionId, attempt + 1)
    schedule(() => {
      void flushSession(sessionId)
    }, retryDelaysMs[attempt])
  }

  const flushSession = (sessionId: string): Promise<void> => {
    const previous = chainBySession.get(sessionId) ?? Promise.resolve()
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        if (!pending.has(sessionId)) {
          return
        }
        const desired = pending.get(sessionId) === true
        const confirmed = await send(sessionId, desired)
        // Only clear the entry when it still holds the value we just sent: a
        // newer toggle queued while this request was in flight must keep it.
        if (confirmed && pending.get(sessionId) === desired) {
          pending.delete(sessionId)
          retriesBySession.delete(sessionId)
          return
        }
        if (!confirmed) {
          scheduleRetry(sessionId)
        }
      })
    chainBySession.set(sessionId, next)
    return next
  }

  return {
    /** Record the desired value and (re)send it in order for this session. */
    set(sessionId: string, enabled: boolean): void {
      if (!sessionId) return
      pending.set(sessionId, enabled)
      retriesBySession.delete(sessionId)
      void flushSession(sessionId)
    },
    /** Retry everything still unconfirmed (rehydrate, reconnect). */
    async flushPending(): Promise<void> {
      await Promise.all(Array.from(pending.keys()).map((sessionId) => flushSession(sessionId)))
    },
    /** Test/inspection helper: the values still awaiting confirmation. */
    pendingEntries(): Array<[string, boolean]> {
      return Array.from(pending.entries())
    },
  }
}
