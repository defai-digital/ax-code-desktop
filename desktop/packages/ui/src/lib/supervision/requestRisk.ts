import type { PermissionRequest } from "@/types/permission"
import type { PendingRequestEntry } from "@/sync/sync-context"

/**
 * How a pending request is ranked and badged, from the runtime's own classification
 * (AX Code ADR-212). A runtime older than 7.26.4 sends neither field, so its requests
 * rank as "unknown" and keep their relative order.
 */
export type RequestRiskLevel = "decide" | "risk" | "unknown" | "safe"

const RANK: Record<RequestRiskLevel, number> = {
  decide: 0,
  risk: 1,
  unknown: 2,
  safe: 3,
}

export function permissionRiskLevel(
  request: Pick<PermissionRequest, "riskClass" | "interactiveOnly">,
): RequestRiskLevel {
  if (request.interactiveOnly === true) return "decide"
  if (request.riskClass === "risk") return "risk"
  if (request.riskClass === "safe") return "safe"
  return "unknown"
}

/** Questions carry no risk class; they rank with unclassified permissions. */
export function requestRiskLevel(entry: PendingRequestEntry): RequestRiskLevel {
  return entry.kind === "permission" ? permissionRiskLevel(entry.request) : "unknown"
}

export function requestRiskRank(entry: PendingRequestEntry): number {
  return RANK[requestRiskLevel(entry)]
}

/** Most consequential first: must-decide, then risky, then unclassified and questions, then safe. Stable. */
export function orderRequestsByRisk<T extends PendingRequestEntry>(entries: readonly T[]): T[] {
  return entries
    .map((entry, index) => ({ entry, index, rank: requestRiskRank(entry) }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map(({ entry }) => entry)
}

/** A must-decide request cannot be pre-approved: the runtime refuses an "always" reply for it. */
export function canAlwaysAllow(request: Pick<PermissionRequest, "interactiveOnly">): boolean {
  return request.interactiveOnly !== true
}
