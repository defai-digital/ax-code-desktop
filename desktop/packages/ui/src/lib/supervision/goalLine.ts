import type { I18nKey } from "@/lib/i18n"
import type { SessionGoalSnapshot, SessionGoalStatus } from "./goal"

export function goalStatusLabelKey(status: SessionGoalStatus): I18nKey {
  return `supervision.goal.status.${status}` as I18nKey
}

export type GoalRemaining =
  | { kind: "tokens"; amount: number }
  | { kind: "time"; unit: Intl.RelativeTimeFormatUnit; count: number }

/**
 * What is left of the budget the runtime reported, preferring an explicit remaining figure and
 * falling back to budget minus used. Null when the runtime reported no budget at all.
 */
export function goalRemaining(goal: SessionGoalSnapshot): GoalRemaining | null {
  if (goal.remainingTokens !== undefined) return { kind: "tokens", amount: goal.remainingTokens }
  if (goal.tokenBudget !== undefined) return { kind: "tokens", amount: Math.max(0, goal.tokenBudget - goal.tokensUsed) }
  if (goal.remainingTimeSeconds !== undefined) return timeRemaining(goal.remainingTimeSeconds)
  if (goal.timeBudgetSeconds !== undefined)
    return timeRemaining(Math.max(0, goal.timeBudgetSeconds - goal.timeUsedSeconds))
  return null
}

export interface GoalTimeParts {
  unit: Intl.RelativeTimeFormatUnit
  count: number
}

/** A duration in the largest whole unit, for used and remaining time alike. */
export function goalTimeParts(seconds: number): GoalTimeParts {
  if (seconds >= 86400) return { unit: "day", count: Math.round(seconds / 86400) }
  if (seconds >= 3600) return { unit: "hour", count: Math.round(seconds / 3600) }
  if (seconds >= 60) return { unit: "minute", count: Math.round(seconds / 60) }
  return { unit: "second", count: Math.round(seconds) }
}

function timeRemaining(seconds: number): GoalRemaining {
  return { kind: "time", ...goalTimeParts(seconds) }
}

export type GoalBudgetUsage =
  | { kind: "tokens"; used: number; total: number; remaining: number }
  | { kind: "time"; usedSeconds: number; remainingSeconds: number }

/**
 * Used and remaining budget together, following the same precedence as
 * goalRemaining. Null when the runtime reported no budget, so there is no
 * remaining figure for the used figure to stand beside.
 */
export function goalBudgetUsage(goal: SessionGoalSnapshot): GoalBudgetUsage | null {
  if (goal.remainingTokens !== undefined || goal.tokenBudget !== undefined) {
    const remaining = goal.remainingTokens ?? Math.max(0, (goal.tokenBudget ?? 0) - goal.tokensUsed)
    const total = goal.tokenBudget ?? goal.tokensUsed + remaining
    return { kind: "tokens", used: goal.tokensUsed, total, remaining }
  }
  if (goal.remainingTimeSeconds !== undefined || goal.timeBudgetSeconds !== undefined) {
    const remainingSeconds =
      goal.remainingTimeSeconds ?? Math.max(0, (goal.timeBudgetSeconds ?? 0) - goal.timeUsedSeconds)
    return { kind: "time", usedSeconds: goal.timeUsedSeconds, remainingSeconds }
  }
  return null
}

export function goalRemainingTimeKey(unit: Intl.RelativeTimeFormatUnit): I18nKey {
  switch (unit) {
    case "day":
      return "supervision.goal.remainingTimeDays" as I18nKey
    case "hour":
      return "supervision.goal.remainingTimeHours" as I18nKey
    case "minute":
      return "supervision.goal.remainingTimeMinutes" as I18nKey
    default:
      return "supervision.goal.remainingTimeSeconds" as I18nKey
  }
}

export function goalUsedTimeKey(unit: Intl.RelativeTimeFormatUnit): I18nKey {
  switch (unit) {
    case "day":
      return "supervision.goal.usedTimeDays" as I18nKey
    case "hour":
      return "supervision.goal.usedTimeHours" as I18nKey
    case "minute":
      return "supervision.goal.usedTimeMinutes" as I18nKey
    default:
      return "supervision.goal.usedTimeSeconds" as I18nKey
  }
}
