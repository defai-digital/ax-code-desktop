/**
 * Sessions that need a human, independent of the project activity tone.
 * Question waits and finished-but-uncommitted runs stay visible even when
 * deriveProjectActivity only marks pending approvals as attention.
 */

/** Rows a needs-you list shows before "Show all": enough to act on, not enough to bury the page. */
export const NEEDS_YOU_VISIBLE_ROWS = 3

export type NeedsYouReason = "permission" | "question" | "uncommitted" | "error"

export interface NeedsYouSessionInput {
  id: string
  projectId: string | null
  permissionCount: number
  questionCount: number
  hasError: boolean
  finishedWithUncommitted: boolean
  updatedAt?: number
  directory?: string | null
  title?: string
}

export interface NeedsYouEntry {
  sessionId: string
  projectId: string | null
  reason: NeedsYouReason
  directory: string | null
  title: string
}

export function needsYouReason(
  session: Pick<NeedsYouSessionInput, "permissionCount" | "questionCount" | "hasError" | "finishedWithUncommitted">,
): NeedsYouReason | null {
  if (session.permissionCount > 0) return "permission"
  if (session.questionCount > 0) return "question"
  if (session.hasError) return "error"
  if (session.finishedWithUncommitted) return "uncommitted"
  return null
}

export function listNeedsYouSessions(sessions: readonly NeedsYouSessionInput[]): NeedsYouEntry[] {
  const entries: NeedsYouEntry[] = []
  for (const session of sessions) {
    const reason = needsYouReason(session)
    if (!reason) continue
    entries.push({
      sessionId: session.id,
      projectId: session.projectId,
      reason,
      directory: session.directory ?? null,
      title: session.title?.trim() || session.id,
    })
  }
  return entries
}

const NEEDS_YOU_URGENCY: Record<NeedsYouReason, number> = {
  permission: 0,
  question: 0,
  error: 1,
  uncommitted: 2,
}

/**
 * Most urgent first: a session blocked on a permission or a question, then an error, then finished
 * work that is not committed. Order inside each tier is preserved.
 */
export function rankNeedsYouEntries(entries: readonly NeedsYouEntry[]): NeedsYouEntry[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort(
      (left, right) =>
        NEEDS_YOU_URGENCY[left.entry.reason] - NEEDS_YOU_URGENCY[right.entry.reason] || left.index - right.index,
    )
    .map(({ entry }) => entry)
}

/** Choosing a needs-you row selects that session. */
export function selectNeedsYouSession(sessionId: string): string {
  return sessionId
}

/**
 * The session a project's attention status should open.
 * Prefer the oldest session that is waiting on a permission or a question.
 */
export function attentionSessionForProject(
  projectId: string,
  sessions: readonly NeedsYouSessionInput[],
): string | null {
  const waiting = sessions
    .filter(
      (session) =>
        session.projectId === projectId && (session.permissionCount > 0 || session.questionCount > 0),
    )
    .sort((left, right) => (left.updatedAt ?? 0) - (right.updatedAt ?? 0) || left.id.localeCompare(right.id))
  return waiting[0]?.id ?? null
}

/**
 * Stable order: sessions that need a human, including errors, come first.
 * Relative order inside each group is preserved.
 */
export function orderSwitcherSessionIds(ids: readonly string[], needsAttention: ReadonlySet<string>): string[] {
  return ids
    .map((id, index) => ({ id, index }))
    .sort((left, right) => {
      const rank = (needsAttention.has(left.id) ? 0 : 1) - (needsAttention.has(right.id) ? 0 : 1)
      if (rank !== 0) return rank
      return left.index - right.index
    })
    .map((entry) => entry.id)
}

export function sessionNeedsSwitcherAttention(session: NeedsYouSessionInput): boolean {
  return needsYouReason(session) !== null
}

/**
 * Expand an attention set to every ancestor of a session it marks.
 *
 * A subagent's session is often the one that needs a person, and the switcher marks the
 * whole chain that leads to it. One ordered pass over the sessions only promoted a parent
 * whose child had already been marked when the loop reached it, so a grandparent was
 * missed whenever the session in the middle came earlier in the list.
 */
export function propagateAttentionToAncestors(
  attentionIds: ReadonlySet<string>,
  sessions: readonly { id: string; parentID?: string | null }[],
): Set<string> {
  const ids = new Set(attentionIds)
  const parentById = new Map<string, string>()
  for (const session of sessions) {
    const parentId = session.parentID
    if (typeof parentId === "string" && parentId.length > 0) {
      parentById.set(session.id, parentId)
    }
  }
  for (const sessionId of ids) {
    let parentId = parentById.get(sessionId)
    while (parentId && !ids.has(parentId)) {
      ids.add(parentId)
      parentId = parentById.get(parentId)
    }
  }
  return ids
}
