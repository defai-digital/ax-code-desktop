import { describe, expect, test } from "vitest"

import type { SessionGoalSnapshot } from "./goal"
import { goalBudgetUsage, goalRemaining, goalStatusLabelKey, goalTimeParts, goalUsedTimeKey } from "./goalLine"

const goal = (overrides: Partial<SessionGoalSnapshot> = {}): SessionGoalSnapshot => ({
  sessionId: "s1",
  objective: "Ship the migration",
  status: "blocked",
  tokensUsed: 1200,
  timeUsedSeconds: 90,
  createdAt: 1000,
  ...overrides,
})

describe("goalRemaining", () => {
  test("prefers the explicit remaining tokens", () => {
    expect(goalRemaining(goal({ remainingTokens: 3000, tokenBudget: 5000 }))).toEqual({ kind: "tokens", amount: 3000 })
  })

  test("falls back to token budget minus used, floored at zero", () => {
    expect(goalRemaining(goal({ tokenBudget: 5000 }))).toEqual({ kind: "tokens", amount: 3800 })
    expect(goalRemaining(goal({ tokenBudget: 1000 }))).toEqual({ kind: "tokens", amount: 0 })
  })

  test("uses remaining time in the largest whole unit", () => {
    expect(goalRemaining(goal({ remainingTimeSeconds: 45 }))).toEqual({ kind: "time", unit: "second", count: 45 })
    expect(goalRemaining(goal({ remainingTimeSeconds: 600 }))).toEqual({ kind: "time", unit: "minute", count: 10 })
    expect(goalRemaining(goal({ remainingTimeSeconds: 7200 }))).toEqual({ kind: "time", unit: "hour", count: 2 })
    expect(goalRemaining(goal({ remainingTimeSeconds: 172800 }))).toEqual({ kind: "time", unit: "day", count: 2 })
  })

  test("falls back to time budget minus used", () => {
    expect(goalRemaining(goal({ timeBudgetSeconds: 600 }))).toEqual({ kind: "time", unit: "minute", count: 9 })
  })

  test("is null when the runtime reported no budget", () => {
    expect(goalRemaining(goal())).toBeNull()
  })
})

describe("goalBudgetUsage", () => {
  test("shows used, total and remaining tokens when the remaining figure is explicit", () => {
    expect(goalBudgetUsage(goal({ remainingTokens: 3800 }))).toEqual({
      kind: "tokens",
      used: 1200,
      total: 5000,
      remaining: 3800,
    })
  })

  test("derives total and remaining from the token budget", () => {
    expect(goalBudgetUsage(goal({ tokenBudget: 5000 }))).toEqual({
      kind: "tokens",
      used: 1200,
      total: 5000,
      remaining: 3800,
    })
  })

  test("shows used and remaining time when both are known", () => {
    expect(goalBudgetUsage(goal({ remainingTimeSeconds: 600 }))).toEqual({
      kind: "time",
      usedSeconds: 90,
      remainingSeconds: 600,
    })
    expect(goalBudgetUsage(goal({ timeBudgetSeconds: 690 }))).toEqual({
      kind: "time",
      usedSeconds: 90,
      remainingSeconds: 600,
    })
  })

  test("is null when the runtime reported no budget", () => {
    expect(goalBudgetUsage(goal())).toBeNull()
  })

  test("converts used time to the largest whole unit and names its keys", () => {
    expect(goalTimeParts(45)).toEqual({ unit: "second", count: 45 })
    expect(goalTimeParts(600)).toEqual({ unit: "minute", count: 10 })
    expect(goalTimeParts(7200)).toEqual({ unit: "hour", count: 2 })
    expect(goalUsedTimeKey("day")).toBe("supervision.goal.usedTimeDays")
    expect(goalUsedTimeKey("hour")).toBe("supervision.goal.usedTimeHours")
    expect(goalUsedTimeKey("minute")).toBe("supervision.goal.usedTimeMinutes")
    expect(goalUsedTimeKey("second")).toBe("supervision.goal.usedTimeSeconds")
  })
})

describe("goalStatusLabelKey", () => {
  test("names every runtime status", () => {
    expect(goalStatusLabelKey("active")).toBe("supervision.goal.status.active")
    expect(goalStatusLabelKey("paused")).toBe("supervision.goal.status.paused")
    expect(goalStatusLabelKey("complete")).toBe("supervision.goal.status.complete")
    expect(goalStatusLabelKey("blocked")).toBe("supervision.goal.status.blocked")
    expect(goalStatusLabelKey("budget_limited")).toBe("supervision.goal.status.budget_limited")
  })
})
