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

export interface MissionFacets {
  query: string
  status: MissionStatusFilter
  projectKeys: readonly string[]
  hasChanges: boolean
}

/** AND across facets; OR within the selected projects. Preserve the incoming urgency order. */
export function filterMissionFacets<
  T extends Pick<SupervisionRow, "title" | "projectLabel" | "directory" | "projectId" | "state" | "evidence" | "goal">,
>(rows: readonly T[], facets: MissionFacets): T[] {
  const projects = new Set(facets.projectKeys)
  return searchMissionRows(rows, facets.query).filter(
    (row) =>
      matchesMissionStatus(row.state, facets.status) &&
      (projects.size === 0 || projects.has(missionProjectKey(row))) &&
      (!facets.hasChanges || row.evidence != null),
  )
}
