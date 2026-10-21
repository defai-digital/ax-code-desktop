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
