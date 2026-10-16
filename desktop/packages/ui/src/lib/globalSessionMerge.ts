/**
 * Fill in sessions the store does not know yet from a fallback snapshot.
 *
 * The fallback is captured before a reload, so it can predate what the store has already applied.
 * Overwriting by id therefore brought a session the user had just marked done - or archived - back
 * as active whenever the reload failed or timed out: the stale copy won. Known ids keep the stored
 * record, and a session the store knows under the other list is not added back either, so it cannot
 * end up active and archived at once.
 *
 * Exposed for unit testing. Not part of the stable consumer surface.
 */
export interface FallbackSessionEntry {
  readonly id: string
}

export const mergeFallbackSessions = <T extends FallbackSessionEntry>(
  existing: readonly T[],
  incoming: readonly T[] | undefined,
  excludedIds?: ReadonlySet<string>,
): T[] => {
  if (!incoming || incoming.length === 0) {
    return existing as T[]
  }

  const known = new Set(existing.map((session) => session.id))
  const appended = incoming.filter(
    (session) => !!session?.id && !known.has(session.id) && !excludedIds?.has(session.id),
  )

  return appended.length === 0 ? (existing as T[]) : [...existing, ...appended]
}
