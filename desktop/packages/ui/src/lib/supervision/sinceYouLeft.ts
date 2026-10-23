import { goalRevision, type SessionGoalSnapshot } from "./goal"
import type { SupervisionState } from "./sessionState"

/** Grace period after leaving so brief tab switches do not trigger the strip. */
export const SINCE_YOU_LEFT_GRACE_MS = 5000

export interface SinceYouLeftInput {
  /** Snapshot of lastViewedAt[sessionId] taken when the session opened, or null when never left. */
  snapshot: number | null
  updatedAt: number
  state: SupervisionState
}

/**
 * The activity time the strip compares with the last visit: the session's
 * own update time, or its goal's revision when that is later. Callers pass
 * the root session's goal, so a child's goal never moves the root's time.
 */
export function sinceYouLeftActivityAt(
  updatedAt: number,
  goal: Pick<SessionGoalSnapshot, "createdAt" | "updatedAt"> | null | undefined,
): number {
  return goal ? Math.max(updatedAt, goalRevision(goal)) : updatedAt
}

export function shouldShowSinceYouLeft(input: SinceYouLeftInput): boolean {
  if (input.snapshot === null) return false
  if (input.state === "running") return false
  return input.updatedAt > input.snapshot + SINCE_YOU_LEFT_GRACE_MS
}

/** i18n key suffix for the state label, without the `supervision.sinceYouLeft.state.` prefix. */
export type SinceYouLeftStateLabel = "review" | "error" | "permission" | "question" | "idle" | "goal"

export function sinceYouLeftStateLabel(state: SupervisionState): SinceYouLeftStateLabel | null {
  switch (state) {
    case "review":
      return "review"
    case "error":
      return "error"
    case "permission":
      return "permission"
    case "question":
      return "question"
    case "idle":
      return "idle"
    case "goal":
      return "goal"
    case "running":
      return null
  }
}

/** Blocked-hook count for the strip chip, or null when there is nothing to show. */
export function sinceYouLeftHookBlocks(blockedCount: number): number | null {
  return blockedCount > 0 ? blockedCount : null
}

export interface RelativeTimeParts {
  value: number
  unit: Intl.RelativeTimeFormatUnit
}

/** Relative-time parts for `updatedAt` as seen from `now`, for Intl.RelativeTimeFormat via i18n. */
export function sinceYouLeftRelativeParts(updatedAt: number, now: number): RelativeTimeParts {
  // The hook clock may trail a just-recorded event by up to one tick. These labels describe elapsed activity, so do not
  // render a recent event as though it will happen in the future.
  const diffMs = Math.min(0, updatedAt - now)
  const seconds = Math.round(diffMs / 1000)
  if (Math.abs(seconds) < 60) return { value: seconds, unit: "second" }
  const minutes = Math.round(diffMs / 60000)
  if (Math.abs(minutes) < 60) return { value: minutes, unit: "minute" }
  const hours = Math.round(diffMs / 3600000)
  if (Math.abs(hours) < 24) return { value: hours, unit: "hour" }
  return { value: Math.round(diffMs / 86400000), unit: "day" }
}
