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
}

const byId = <T extends SessionListEntry>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

export function mergeSessionListPage<T extends SessionListEntry>(
  page: readonly T[],
  current: readonly T[],
  knownBeforeRequest?: ReadonlySet<string>,
): T[] {
  const listed = new Set(page.map((session) => session.id))
  const carried = current.filter((session) => {
    if (listed.has(session.id)) {
      return false
    }
    // Children are always carried: the page lists roots only.
    if (session.parentID) {
      return true
    }
    // A root the page no longer lists was deleted or archived on the server, and the page is
    // authoritative — but only for the sessions that existed when the page was read. A root this
    // client first learned about while the request was in flight cannot be in it: the answer came
    // from an index the request had already read, and dropping it hides a session the user just
    // created until the runtime's next update for it.
    return Boolean(knownBeforeRequest && !knownBeforeRequest.has(session.id))
  })
  if (carried.length === 0) {
    return [...page]
  }
  return [...page, ...carried].sort(byId)
}
