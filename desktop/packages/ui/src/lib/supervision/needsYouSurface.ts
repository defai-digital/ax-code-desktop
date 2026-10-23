import type { PendingRequestEntry } from "@/sync/sync-context"
import type { SupervisionEvidence, SupervisionState } from "@/lib/supervision/sessionState"
import { orderRequestsByRisk, requestRiskRank } from "@/lib/supervision/requestRisk"

export interface SupervisionRequestRoot {
  sessionId: string
  /** This root and its subagent sessions. A request on any of them belongs to the root. */
  treeSessionIds: readonly string[]
}

export interface SupervisionRequestGroup<TRow extends SupervisionRequestRoot> {
  row: TRow
  requests: PendingRequestEntry[]
}

/**
 * Pending requests grouped under the root session that owns them, most consequential first.
 * Inside a group, requests are ordered by risk (must-decide, risky, unclassified, safe), keeping
 * their input order within a level. Groups are ordered by their most consequential request, and
 * otherwise keep the row order given (the supervision ranking). Requests whose session is in no
 * tree are returned unmatched, ordered the same way.
 */
export function groupRequestsBySupervisionRoot<TRow extends SupervisionRequestRoot>(
  rows: readonly TRow[],
  requests: readonly PendingRequestEntry[],
): { groups: Array<SupervisionRequestGroup<TRow>>; unmatched: PendingRequestEntry[] } {
  const rootBySession = new Map<string, TRow>()
  for (const row of rows) {
    if (!rootBySession.has(row.sessionId)) rootBySession.set(row.sessionId, row)
    for (const sessionId of row.treeSessionIds) {
      if (!rootBySession.has(sessionId)) rootBySession.set(sessionId, row)
    }
  }

  const grouped = new Map<string, PendingRequestEntry[]>()
  const unmatched: PendingRequestEntry[] = []
  for (const request of requests) {
    const row = rootBySession.get(request.sessionId)
    if (!row) {
      unmatched.push(request)
      continue
    }
    const list = grouped.get(row.sessionId)
    if (list) list.push(request)
    else grouped.set(row.sessionId, [request])
  }

  const groups: Array<SupervisionRequestGroup<TRow>> = []
  for (const row of rows) {
    const list = grouped.get(row.sessionId)
    if (list && list.length > 0) groups.push({ row, requests: orderRequestsByRisk(list) })
  }
  const ranked = groups
    .map((group, index) => ({ group, index, rank: requestRiskRank(group.requests[0]) }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map(({ group }) => group)
  return { groups: ranked, unmatched: orderRequestsByRisk(unmatched) }
}

/**
 * Goal rows that are not already represented by a pending-request group. A goal is the only decision that is not
 * a request; errors and finished work are follow-ups and are not listed under Needs you.
 */
export function supervisionStatusRows<TRow extends { sessionId: string; state: SupervisionState }>(
  rows: readonly TRow[],
  requestRootIds: ReadonlySet<string>,
): TRow[] {
  return rows.filter((row) => row.state === "goal" && !requestRootIds.has(row.sessionId))
}

/** "Session title · Project" for a cross-session request card. Either half may be missing. */
export function supervisionRequestContext(title: string, projectLabel: string | null | undefined): string {
  const name = title.trim()
  const project = projectLabel?.trim() ?? ""
  if (name && project) return `${name} · ${project}`
  return name || project
}

/**
 * The evidence line a supervision row shows, for example "+12 −3 · 4 files".
 * `filesLabel` is already translated and includes its count. Null when there is nothing to show.
 */
export function formatSupervisionEvidenceLine(
  evidence: Pick<SupervisionEvidence, "additions" | "deletions" | "files"> | null | undefined,
  filesLabel: string,
): string | null {
  if (!evidence) return null
  const hasDiff = evidence.additions > 0 || evidence.deletions > 0
  const diff = `+${evidence.additions} −${evidence.deletions}`
  const files = filesLabel.trim()
  if (hasDiff && evidence.files > 0 && files) return `${diff} · ${files}`
  if (hasDiff) return diff
  if (evidence.files > 0 && files) return files
  return null
}
