/**
 * The directory store keeps its session list sorted by id (`Binary.search` inserts
 * there, and lookups binary-search the same array), while `session.list` is asked
 * for `roots: true` only. The event pipeline inserts child (subagent) sessions as
 * they appear, and the session lifecycle, notification and parent-resync paths read
 * them back out of that list, so a re-bootstrap must carry the children it already
 * knows instead of erasing them until they announce themselves again.
 *
 * Exposed for unit testing. Not part of the stable consumer surface.
 */
export interface SessionListEntry {
  readonly id: string
  readonly parentID?: string | null
  readonly time?: { readonly updated?: number }
}

const byId = <T extends SessionListEntry>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

export function mergeSessionListPage<T extends SessionListEntry>(
  page: readonly T[],
  current: readonly T[],
  knownBeforeRequest?: ReadonlyMap<string, number | undefined>,
): T[] {
  const currentById = new Map(current.map((session) => [session.id, session]))
  const listed = new Set<string>()
  const merged: T[] = []

  for (const session of page) {
    listed.add(session.id)
    const currentEntry = currentById.get(session.id)
    if (!currentEntry) {
      // It existed when the request went out and is gone now: the session was deleted or
      // archived while the page was in flight, so the page's copy is stale.
      if (knownBeforeRequest?.has(session.id)) {
        continue
      }
      merged.push(session)
      continue
    }

    // An event applied after the request snapshot wins over the page's older view (a rename,
    // share state, archive flag): the page was read before that event.
    const beforeUpdated = knownBeforeRequest?.get(session.id)
    const currentUpdated = currentEntry.time?.updated
    if (typeof beforeUpdated === "number" && typeof currentUpdated === "number" && currentUpdated > beforeUpdated) {
      merged.push(currentEntry)
      continue
    }
    merged.push(session)
  }

  for (const session of current) {
    if (listed.has(session.id)) {
      continue
    }
    // Children are always carried: the page lists roots only.
    if (session.parentID) {
      merged.push(session)
      continue
    }
    // A root the page no longer lists was deleted or archived on the server, and the page is
    // authoritative — but only for the sessions that existed when the page was read. A root this
    // client first learned about while the request was in flight cannot be in it: the answer came
    // from an index the request had already read, and dropping it hides a session the user just
    // created until the runtime's next update for it.
    if (knownBeforeRequest && !knownBeforeRequest.has(session.id)) {
      merged.push(session)
    }
  }

  return merged.sort(byId)
}
