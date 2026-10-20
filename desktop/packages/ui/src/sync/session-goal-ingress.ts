import type { Event } from "@defai-digital/ax-code-sdk/v2/client"

import { normalizeSessionGoal, type SessionGoalSnapshot } from "@/lib/supervision/goal"
import { useSessionGoalStore } from "@/stores/useSessionGoalStore"

/**
 * What a `session.goal` payload should do. The store key is `properties.sessionID`.
 * A goal whose own session id disagrees would annotate the wrong session, so it is ignored
 * rather than cleared. A null or malformed goal is "no goal".
 */
export type SessionGoalEventDecision =
  | { kind: "ignore" }
  | { kind: "apply"; sessionId: string; goal: SessionGoalSnapshot | null }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export function decideSessionGoalEvent(payload: { type?: unknown; properties?: unknown }): SessionGoalEventDecision {
  if (payload.type !== "session.goal") return { kind: "ignore" }
  if (!isRecord(payload.properties)) return { kind: "ignore" }
  const sessionId = typeof payload.properties.sessionID === "string" ? payload.properties.sessionID.trim() : ""
  if (!sessionId) return { kind: "ignore" }
  const goal = payload.properties.goal
  if (goal === null) return { kind: "apply", sessionId, goal: null }
  if (isRecord(goal)) {
    const goalSessionId = typeof goal.sessionID === "string" ? goal.sessionID.trim() : ""
    if (goalSessionId && goalSessionId !== sessionId) return { kind: "ignore" }
  }
  return { kind: "apply", sessionId, goal: normalizeSessionGoal(goal) }
}

/** Apply one `session.goal` event to the goal store. Returns false when the payload is ignored. */
export function ingestSessionGoalEvent(payload: Event): boolean {
  const decision = decideSessionGoalEvent(payload)
  if (decision.kind === "ignore") return false
  useSessionGoalStore.getState().applyEvent(decision.sessionId, decision.goal)
  return true
}

/**
 * `server.resync_required` is handled on the global branch and returns before the event tap,
 * so the loader cannot see it there. The handler bumps this counter at that recovery site.
 */
let recoveryEpoch = 0
const recoveryListeners = new Set<() => void>()

export function noteSessionGoalRecovery(): void {
  recoveryEpoch += 1
  for (const listener of recoveryListeners) listener()
}

export function sessionGoalRecoveryEpoch(): number {
  return recoveryEpoch
}

export function subscribeSessionGoalRecovery(listener: () => void): () => void {
  recoveryListeners.add(listener)
  return () => {
    recoveryListeners.delete(listener)
  }
}
