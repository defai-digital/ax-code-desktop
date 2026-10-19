import { describe, expect, test } from "vitest"

import {
  SESSION_GOAL_OBJECTIVE_LIMIT,
  goalNeedsPerson,
  goalRevision,
  normalizeSessionGoal,
} from "./goal"

const payload = (overrides: Record<string, unknown> = {}) => ({
  sessionID: "ses_1",
  objective: "Ship the migration",
  status: "active",
  tokensUsed: 1200,
  timeUsedSeconds: 90,
  time: { created: 1000 },
  ...overrides,
})

describe("normalizeSessionGoal", () => {
  test("keeps a complete payload", () => {
    expect(
      normalizeSessionGoal(
        payload({
          tokenBudget: 5000,
          remainingTokens: 3800,
          timeBudgetSeconds: 600,
          remainingTimeSeconds: 510,
          planPath: " .ax-code/plan.md ",
          time: { created: 1000, updated: 2000 },
        }),
      ),
    ).toEqual({
      sessionId: "ses_1",
      objective: "Ship the migration",
      status: "active",
      tokensUsed: 1200,
      timeUsedSeconds: 90,
      tokenBudget: 5000,
      remainingTokens: 3800,
      timeBudgetSeconds: 600,
      remainingTimeSeconds: 510,
      planPath: ".ax-code/plan.md",
      createdAt: 1000,
      updatedAt: 2000,
    })
  })

  test("returns null for a null goal and non-objects", () => {
    expect(normalizeSessionGoal(null)).toBeNull()
    expect(normalizeSessionGoal(undefined)).toBeNull()
    expect(normalizeSessionGoal("goal")).toBeNull()
    expect(normalizeSessionGoal([payload()])).toBeNull()
  })

  test("rejects an unknown status, an empty objective, a missing id or a missing creation time", () => {
    expect(normalizeSessionGoal(payload({ status: "verified" }))).toBeNull()
    expect(normalizeSessionGoal(payload({ objective: "   " }))).toBeNull()
    expect(normalizeSessionGoal(payload({ sessionID: "" }))).toBeNull()
    expect(normalizeSessionGoal(payload({ time: {} }))).toBeNull()
    expect(normalizeSessionGoal(payload({ time: undefined }))).toBeNull()
  })

  test("drops invalid numbers instead of showing them", () => {
    const goal = normalizeSessionGoal(
      payload({ tokensUsed: -5, timeUsedSeconds: Number.NaN, tokenBudget: "100", remainingTokens: Infinity }),
    )
    expect(goal).toMatchObject({ tokensUsed: 0, timeUsedSeconds: 0 })
    expect(goal).not.toHaveProperty("tokenBudget")
    expect(goal).not.toHaveProperty("remainingTokens")
  })

  test("truncates a very long objective", () => {
    const goal = normalizeSessionGoal(payload({ objective: "x".repeat(SESSION_GOAL_OBJECTIVE_LIMIT + 50) }))
    expect(goal?.objective).toHaveLength(SESSION_GOAL_OBJECTIVE_LIMIT)
  })
})

describe("goalNeedsPerson", () => {
  test("only blocked and budget-limited goals need a person", () => {
    expect(goalNeedsPerson({ status: "blocked" })).toBe(true)
    expect(goalNeedsPerson({ status: "budget_limited" })).toBe(true)
    expect(goalNeedsPerson({ status: "active" })).toBe(false)
    expect(goalNeedsPerson({ status: "paused" })).toBe(false)
    expect(goalNeedsPerson({ status: "complete" })).toBe(false)
    expect(goalNeedsPerson(null)).toBe(false)
    expect(goalNeedsPerson(undefined)).toBe(false)
  })
})

describe("goalRevision", () => {
  test("uses the update time and falls back to the creation time", () => {
    expect(goalRevision({ createdAt: 10 })).toBe(10)
    expect(goalRevision({ createdAt: 10, updatedAt: 25 })).toBe(25)
  })
})
