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

export function mergeSessionListPage<T extends SessionListEntry>(page: readonly T[], current: readonly T[]): T[] {
  const listed = new Set(page.map((session) => session.id))
  // Only children are carried over: a locally-known root that the page no longer
  // lists was deleted or archived on the server, and the page is authoritative.
  const localChildren = current.filter((session) => Boolean(session.parentID) && !listed.has(session.id))
  if (localChildren.length === 0) {
    return [...page]
  }
  return [...page, ...localChildren].sort(byId)
}
