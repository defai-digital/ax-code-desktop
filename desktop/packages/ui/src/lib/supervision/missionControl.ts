import type { SupervisionRow } from "./rows"
import { isLiveState, type SupervisionState } from "./sessionState"

export interface MissionControlRowLike {
  sessionId: string
  state: SupervisionState
  updatedAt: number
}

export interface WorkingSetLike {
  id: string
  sessionIds: readonly string[]
}

export type MissionControlFilter = { kind: "live" } | { kind: "recent" } | { kind: "workingSet"; workingSetId: string }

const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000

export function filterRows<T extends MissionControlRowLike>(
  rows: readonly T[],
  filter: MissionControlFilter,
  workingSets: readonly WorkingSetLike[],
  now: number = Date.now(),
): T[] {
  if (filter.kind === "live") return rows.filter((row) => isLiveState(row.state))
  if (filter.kind === "recent") {
    const cutoff = now - RECENT_WINDOW_MS
    return rows.filter((row) => row.updatedAt >= cutoff)
  }
  const set = workingSets.find((item) => item.id === filter.workingSetId)
  if (!set) return []
  const ids = new Set(set.sessionIds)
  return rows.filter((row) => ids.has(row.sessionId))
}

export type PrimaryAction = "review-request" | "answer" | "open" | "review-changes"

export function primaryActionFor(state: SupervisionState): PrimaryAction {
  switch (state) {
    case "permission":
      return "review-request"
    case "question":
      return "answer"
    case "review":
      return "review-changes"
    default:
      return "open"
  }
}

export function moveSelection(index: number, delta: number, length: number): number {
  if (length <= 0) return -1
  if (index < 0) return delta < 0 ? length - 1 : 0
  return Math.min(length - 1, Math.max(0, index + delta))
}

export type MissionStatusFilter = "all" | "attention" | "running" | "review"

export function matchesMissionStatus(state: SupervisionState, status: MissionStatusFilter): boolean {
  if (status === "all") return true
  if (status === "attention")
    return state === "permission" || state === "question" || state === "error" || state === "goal"
  return state === status
}

export function searchMissionRows<
  T extends {
    title: string
    projectLabel: string | null
    directory: string | null
    goal?: { objective: string } | null
  },
>(rows: readonly T[], query: string): T[] {
  const search = query.trim().toLocaleLowerCase()
  return rows.filter(
    (row) =>
      !search ||
      [row.title, row.projectLabel, row.directory, row.goal?.objective].some((value) =>
        value?.toLocaleLowerCase().includes(search),
      ),
  )
}

/** Match the same project identity used by board grouping, including unregistered directories. */
export function missionProjectKey(row: Pick<SupervisionRow, "projectId" | "directory">): string {
  return row.projectId ?? row.directory ?? "__none__"
}

export const MISSION_PR_STATES = ["open", "draft", "merged", "closed"] as const
export const MISSION_CHECK_STATES = ["passed", "failed", "pending", "none"] as const
export type MissionPrState = (typeof MISSION_PR_STATES)[number]
export type MissionCheckState = (typeof MISSION_CHECK_STATES)[number]
export interface MissionPrFilter {
  states: readonly MissionPrState[]
  checks: readonly MissionCheckState[]
}

/** Stale/absent PR data is unknown. Completed PRs cannot have actionable failing checks. */
export function missionPrChecks(pr: SupervisionRow["pullRequest"]): MissionCheckState | null {
  if (!pr || pr.stale) return null
  if ((pr.state === "merged" || pr.state === "closed") && pr.checks === "failed") return null
  return pr.checks ?? "none"
}

export function matchesMissionPr(row: Pick<SupervisionRow, "pullRequest">, filter?: MissionPrFilter): boolean {
  const pr = row.pullRequest
  return (
    (!filter?.states.length || Boolean(pr && !pr.stale && filter.states.includes(pr.state))) &&
    (!filter?.checks.length ||
      Boolean(pr && missionPrChecks(pr) !== null && filter.checks.includes(missionPrChecks(pr)!)))
  )
}

export interface MissionFacets {
  query: string
  status: MissionStatusFilter
  projectKeys: readonly string[]
  hasChanges: boolean
  /** Sessions whose verification envelopes include a failed check. */
  checksFailing?: boolean
  pr?: MissionPrFilter
  /** Only sessions updated after the user last viewed them (never-viewed sessions count as updated). */
  updatedOnly?: boolean
  lastViewedAt?: Readonly<Record<string, number>>
}

/** Whether a session changed after the user last looked at it. */
export function updatedSinceViewed(
  row: { sessionId: string; updatedAt: number },
  lastViewedAt: Readonly<Record<string, number>> | undefined,
): boolean {
  return row.updatedAt > (lastViewedAt?.[row.sessionId] ?? 0)
}

/** AND across facets; OR within the selected projects. Preserve the incoming urgency order. */
export function filterMissionFacets<
  T extends Pick<
    SupervisionRow,
    | "sessionId"
    | "updatedAt"
    | "title"
    | "projectLabel"
    | "directory"
    | "projectId"
    | "state"
    | "evidence"
    | "goal"
    | "checks"
    | "pullRequest"
  >,
>(rows: readonly T[], facets: MissionFacets): T[] {
  const projects = new Set(facets.projectKeys)
  return searchMissionRows(rows, facets.query).filter(
    (row) =>
      matchesMissionStatus(row.state, facets.status) &&
      (projects.size === 0 || projects.has(missionProjectKey(row))) &&
      (!facets.hasChanges || row.evidence != null) &&
      (!facets.checksFailing || (row.checks?.state === "failed" && !row.checks.stale)) &&
      matchesMissionPr(row, facets.pr) &&
      (!facets.updatedOnly || updatedSinceViewed(row, facets.lastViewedAt)),
  )
}

/** Disjunctive counts: retain every other facet, including the other PR/CI group. */
export function missionPrFacetCounts(rows: readonly SupervisionRow[], facets: MissionFacets) {
  return {
    states: Object.fromEntries(
      MISSION_PR_STATES.map((state) => [
        state,
        filterMissionFacets(rows, { ...facets, pr: { states: [state], checks: facets.pr?.checks ?? [] } }).length,
      ]),
    ) as Record<MissionPrState, number>,
    checks: Object.fromEntries(
      MISSION_CHECK_STATES.map((state) => [
        state,
        filterMissionFacets(rows, { ...facets, pr: { states: facets.pr?.states ?? [], checks: [state] } }).length,
      ]),
    ) as Record<MissionCheckState, number>,
  }
}
