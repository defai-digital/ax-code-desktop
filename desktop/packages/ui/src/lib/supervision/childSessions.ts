import type { SupervisionState } from "./sessionState"

export interface ChildSessionSummary {
  sessionId: string
  title: string
  state: SupervisionState
  updatedAt: number
}

/** Use only the loaded tree and each session's own state, never its root's rolled-up state. */
export function childSessionSummaries(
  rootId: string,
  treeSessionIds: readonly string[],
  sessions: ReadonlyMap<string, ChildSessionSummary>,
): ChildSessionSummary[] {
  const result: ChildSessionSummary[] = []
  for (const id of new Set(treeSessionIds)) {
    if (id === rootId) continue
    const session = sessions.get(id)
    if (session) result.push({ ...session, title: session.title.trim() || id })
  }
  return result
}

/** Child agents shown inline under their root row; the rest stay in the row's details. */
export const INLINE_CHILD_LIMIT = 3

const INLINE_STATE_ORDER: readonly SupervisionState[] = [
  "permission",
  "question",
  "error",
  "goal",
  "review",
  "running",
  "idle",
]

/** Children that need a person come first, then working ones, newest first within a state. */
export function inlineChildSessions(
  children: readonly ChildSessionSummary[] | undefined,
  limit = INLINE_CHILD_LIMIT,
): { shown: ChildSessionSummary[]; hidden: number } {
  if (!children?.length) return { shown: [], hidden: 0 }
  const ordered = [...children].sort(
    (a, b) =>
      INLINE_STATE_ORDER.indexOf(a.state) - INLINE_STATE_ORDER.indexOf(b.state) || b.updatedAt - a.updatedAt,
  )
  return { shown: ordered.slice(0, limit), hidden: Math.max(0, ordered.length - limit) }
}
