import type { PendingRequestEntry } from "@/sync/sync-context"
import { permissionRiskLevel, type RequestRiskLevel } from "./requestRisk"

type PermissionEntry = Extract<PendingRequestEntry, { kind: "permission" }>

export interface PermissionBatch {
  /** The permission the requests ask for, e.g. "edit" or "bash". */
  permission: string
  /** The runtime's risk class shared by every request in the batch ("safe" or "unknown"). */
  risk: Extract<RequestRiskLevel, "safe" | "unknown">
  entries: PermissionEntry[]
  /** Distinct sessions asking, so the label can say how many agents are waiting. */
  sessionCount: number
  /** Every scope the decision would cover, so the confirm step can show the whole blast radius. */
  patterns: string[]
}

/** Identity of the exact set a decision covers: the decision store's key fields, not request ids alone. */
export function permissionBatchSignature(batch: PermissionBatch): string {
  return batch.entries.map((entry) => `${entry.sessionId}\u0000${entry.request.id}`).join("\n")
}

/**
 * Pending permission requests grouped by permission and the runtime's risk class, only where two or more wait, so one
 * explicit decision can answer them. Never batched: questions (each needs its own answer), requests the runtime marks
 * must-decide-interactively, and requests it classifies as risky. `isAnswerable` drops requests another surface is already
 * answering. Groups keep the order of their first request, so passing the inbox order keeps its urgency order.
 */
export function permissionBatches(
  entries: readonly PendingRequestEntry[],
  isAnswerable: (entry: PermissionEntry) => boolean = () => true,
): PermissionBatch[] {
  const groups = new Map<string, { permission: string; risk: PermissionBatch["risk"]; entries: PermissionEntry[] }>()
  for (const entry of entries) {
    if (entry.kind !== "permission" || !isAnswerable(entry)) continue
    const permission = entry.request.permission?.trim()
    if (!permission) continue
    const risk = permissionRiskLevel(entry.request)
    if (risk === "decide" || risk === "risk") continue
    const key = `${permission}\u0000${risk}`
    const group = groups.get(key)
    if (group) group.entries.push(entry)
    else groups.set(key, { permission, risk, entries: [entry] })
  }
  const batches: PermissionBatch[] = []
  for (const group of groups.values()) {
    if (group.entries.length < 2) continue
    batches.push({
      ...group,
      sessionCount: new Set(group.entries.map((entry) => entry.sessionId)).size,
      patterns: [...new Set(group.entries.flatMap((entry) => (entry.request.patterns ?? []).filter(Boolean)))],
    })
  }
  return batches
}
