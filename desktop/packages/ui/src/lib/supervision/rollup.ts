import { needsHuman, treeStatePrecedence, type SupervisionState } from "./sessionState"

export interface RollupInput {
  sessionId: string
  parentId: string | null
  state: SupervisionState
}

export interface RolledUpState {
  state: SupervisionState
  /** The root and every descendant loaded, root first. */
  sessionIds: string[]
}

/**
 * Subagent sessions do not get their own row; a request or error inside a child must still surface on the
 * root session the user started. Returns, for each root session, the state its tree shows.
 *
 * A subtree whose root is archived or not loaded has no row to fold into. It is kept, under its topmost loaded
 * session, only while it needs a person, so a blocked request is never hidden and finished orphans stay out.
 */
export function rollUpChildStates(rows: readonly RollupInput[]): Map<string, RolledUpState> {
  const byId = new Map(rows.map((row) => [row.sessionId, row]))
  const orphanRoots = new Set<string>()
  const rootOf = (row: RollupInput): string => {
    let current = row
    const seen = new Set<string>([current.sessionId])
    while (current.parentId) {
      const parent = byId.get(current.parentId)
      if (!parent) {
        orphanRoots.add(current.sessionId)
        break
      }
      if (seen.has(parent.sessionId)) break
      seen.add(parent.sessionId)
      current = parent
    }
    return current.sessionId
  }
  const result = new Map<string, RolledUpState>()
  for (const row of rows) {
    const root = rootOf(row)
    const existing = result.get(root)
    if (!existing) {
      result.set(root, { state: row.state, sessionIds: [row.sessionId] })
      continue
    }
    if (treeStatePrecedence(row.state) < treeStatePrecedence(existing.state)) existing.state = row.state
    if (row.sessionId === root) existing.sessionIds.unshift(row.sessionId)
    else existing.sessionIds.push(row.sessionId)
  }
  for (const root of orphanRoots) {
    const rolled = result.get(root)
    if (rolled && !needsHuman(rolled.state)) result.delete(root)
  }
  return result
}
