import type { SupervisionState } from "./sessionState"

/** Grace period after leaving so brief tab switches do not trigger the strip. */
export const SINCE_YOU_LEFT_GRACE_MS = 5000

export interface SinceYouLeftInput {
  /** Snapshot of lastViewedAt[sessionId] taken when the session opened, or null when never left. */
  snapshot: number | null
  updatedAt: number
  state: SupervisionState
}

export function shouldShowSinceYouLeft(input: SinceYouLeftInput): boolean {
  if (input.snapshot === null) return false
  if (input.state === "running") return false
  return input.updatedAt > input.snapshot + SINCE_YOU_LEFT_GRACE_MS
}

/** i18n key suffix for the state label, without the `supervision.sinceYouLeft.state.` prefix. */
export type SinceYouLeftStateLabel = "review" | "error" | "permission" | "question" | "idle"

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
  const diffMs = updatedAt - now
  const absSeconds = Math.abs(diffMs) / 1000
  if (absSeconds < 60) return { value: Math.round(diffMs / 1000), unit: "second" }
  const absMinutes = absSeconds / 60
  if (absMinutes < 60) return { value: Math.round(diffMs / 60000), unit: "minute" }
  const absHours = absMinutes / 60
  if (absHours < 24) return { value: Math.round(diffMs / 3600000), unit: "hour" }
  return { value: Math.round(diffMs / 86400000), unit: "day" }
}
