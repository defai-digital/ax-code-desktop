/**
 * Which snapshot-materialization request for a session may still write.
 *
 * The materialization runs as a deferred request per directory and session, with a cooldown so a burst
 * of delta gaps asks for one snapshot rather than many. Two requests can be in flight for the same
 * session when the first outlives the cooldown, and the first one to *start* is not the first one to
 * finish: without a token, the older request both cleared the newer one's registration and then wrote
 * its older snapshot over the messages the newer one had already published.
 *
 * Exposed for unit testing. Not part of the stable consumer surface.
 */
export type MaterializationClaim = {
  readonly key: string
  readonly token: number
}

export const createMaterializationQueue = () => {
  let nextToken = 0
  const pending = new Map<string, { token: number; enqueuedAt: number }>()
  // Completed claims no longer authorize writes, but their start time still
  // throttles repeated gaps. Bound retained tombstones for long-lived clients.
  const completed = new Map<string, number>()
  const maxCompleted = 4096
  let nextPruneAt = 0

  return {
    /** Whether this key has no request in flight and none recent enough to skip. */
    shouldEnqueue(key: string, now: number, cooldownMs: number): boolean {
      if (now >= nextPruneAt) {
        for (const [completedKey, startedAt] of completed) {
          if (now - startedAt >= cooldownMs) completed.delete(completedKey)
        }
        nextPruneAt = now + cooldownMs
      }
      const startedAt = pending.get(key)?.enqueuedAt ?? completed.get(key)
      return startedAt === undefined || now - startedAt >= cooldownMs
    },

    /** Take the claim for a key, superseding whatever was in flight for it. */
    begin(key: string, now: number): MaterializationClaim {
      nextToken += 1
      completed.delete(key)
      pending.set(key, { token: nextToken, enqueuedAt: now })
      return { key, token: nextToken }
    },

    /** Whether a newer request has superseded this claim. */
    isCurrent(claim: MaterializationClaim): boolean {
      return pending.get(claim.key)?.token === claim.token
    },

    /** Release a claim; a claim a newer request replaced is already gone. */
    finish(claim: MaterializationClaim): void {
      const current = pending.get(claim.key)
      if (current?.token === claim.token) {
        pending.delete(claim.key)
        completed.set(claim.key, current.enqueuedAt)
        if (completed.size > maxCompleted) completed.delete(completed.keys().next().value!)
      }
    },
  }
}

export type MaterializationQueue = ReturnType<typeof createMaterializationQueue>
