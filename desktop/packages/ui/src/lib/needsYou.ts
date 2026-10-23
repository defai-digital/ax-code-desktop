import type { SessionGoalSnapshot } from "@/lib/supervision/goal"

/**
 * Sessions that need a human decision. "Needs you" means the runtime is stopped and only a person can let it
 * continue: a pending approval, a pending question, or a goal that cannot progress. Everything else a person may
 * still want to look at (an unseen failure, finished work with changes) is a follow-up: it is listed quietly and
 * can be dismissed, but it never lights the titlebar, the project tone, or the next-needs-you walk. The project
 * activity tone consumes the decision reasons through needsAttentionSessionIds.
 */

/** Rows a needs-you list shows before "Show all": enough to act on, not enough to bury the page. */
export const NEEDS_YOU_VISIBLE_ROWS = 3

export type NeedsYouReason = "permission" | "question" | "goal"

/** Passive reasons a person may want to look at. No decision is pending, so they never interrupt. */
export type FollowUpReason = "error" | "uncommitted"

export type AttentionReason = NeedsYouReason | FollowUpReason

export interface NeedsYouSessionInput {
  id: string
  projectId: string | null
  permissionCount: number
  questionCount: number
  /** An unseen failure the user has not looked at yet. */
  hasError: boolean
  /** The run ended, the session produced changes, and the directory is still dirty. Already net of any dismissal. */
  finishedWithUncommitted: boolean
  /** The runtime goal cannot progress without a person (blocked or budget-limited). */
  goalNeedsPerson?: boolean
  /** The runtime goal snapshot, carried through so a needs-you entry can show its objective line. */
  goal?: SessionGoalSnapshot | null
  /** The runtime status type for the session: "busy", "retry" or "idle", when the caller knows it. */
  statusType?: string | null
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
  goal: SessionGoalSnapshot | null
}

export interface FollowUpEntry {
  sessionId: string
  projectId: string | null
  reason: FollowUpReason
  directory: string | null
  title: string
}

function isRunning(statusType: string | null | undefined): boolean {
  return statusType === "busy" || statusType === "retry"
}

/** The decision a session is waiting on, or null. Only a person can resolve these. */
export function needsYouReason(
  session: Pick<NeedsYouSessionInput, "permissionCount" | "questionCount" | "goalNeedsPerson" | "statusType">,
): NeedsYouReason | null {
  if (session.permissionCount > 0) return "permission"
  if (session.questionCount > 0) return "question"
  // A session that is working again does not need a person for its blocked
  // goal, matching deriveSupervisionState where running outranks goal.
  if (session.goalNeedsPerson && !isRunning(session.statusType)) return "goal"
  return null
}

/**
 * Why a session is worth a look although nothing is blocked. A working session has no follow-up: the unseen-error
 * flag is only cleared when the user views the session, so it can be stale while the run is already recovering.
 */
export function followUpReason(
  session: Pick<NeedsYouSessionInput, "hasError" | "finishedWithUncommitted" | "statusType">,
): FollowUpReason | null {
  if (isRunning(session.statusType)) return null
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
      goal: session.goal ?? null,
    })
  }
  return entries
}

/** One row per session: a session that waits on a decision is listed there, not again as a follow-up. */
export function listFollowUpSessions(sessions: readonly NeedsYouSessionInput[]): FollowUpEntry[] {
  const entries: FollowUpEntry[] = []
  for (const session of sessions) {
    if (needsYouReason(session)) continue
    const reason = followUpReason(session)
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
  goal: 1,
}

const FOLLOW_UP_URGENCY: Record<FollowUpReason, number> = {
  error: 0,
  uncommitted: 1,
}

/** Failures first, then finished work to review. Order inside each tier is preserved. */
export function rankFollowUpEntries(entries: readonly FollowUpEntry[]): FollowUpEntry[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort(
      (left, right) =>
        FOLLOW_UP_URGENCY[left.entry.reason] - FOLLOW_UP_URGENCY[right.entry.reason] || left.index - right.index,
    )
    .map(({ entry }) => entry)
}

/**
 * Most urgent first: a session blocked on a permission or a question, then a goal that needs a person.
 * Order inside each tier is preserved.
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
 * Any session waiting on a decision is eligible: lowest urgency first
 * (permission and question, then goal), then oldest.
 */
export function attentionSessionForProject(
  projectId: string,
  sessions: readonly NeedsYouSessionInput[],
): string | null {
  const waiting = sessions
    .map((session) => ({ session, reason: needsYouReason(session) }))
    .filter(
      (entry): entry is { session: NeedsYouSessionInput; reason: NeedsYouReason } =>
        entry.session.projectId === projectId && entry.reason !== null,
    )
    .sort(
      (left, right) =>
        NEEDS_YOU_URGENCY[left.reason] - NEEDS_YOU_URGENCY[right.reason] ||
        (left.session.updatedAt ?? 0) - (right.session.updatedAt ?? 0) ||
        left.session.id.localeCompare(right.session.id),
    )
  return waiting[0]?.session.id ?? null
}

/**
 * Stable order: sessions that wait on a decision come first.
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
