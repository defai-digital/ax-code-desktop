import { beforeEach, describe, expect, test } from "vitest"

import { normalizeSessionGoal, type SessionGoalSnapshot } from "@/lib/supervision/goal"
import { useSessionGoalStore } from "./useSessionGoalStore"

const goal = (overrides: Partial<SessionGoalSnapshot> = {}): SessionGoalSnapshot => {
  const value = normalizeSessionGoal({
    sessionID: "ses_1",
    objective: "Ship it",
    status: "active",
    tokensUsed: 0,
    timeUsedSeconds: 0,
    time: { created: 100, updated: 100 },
  })
  if (!value) throw new Error("fixture must normalize")
  return { ...value, ...overrides }
}

const state = () => useSessionGoalStore.getState()

beforeEach(() => state().clear())

describe("useSessionGoalStore", () => {
  test("an event stores the goal and marks the session known", () => {
    state().applyEvent("ses_1", goal())
    expect(state().goals.ses_1?.objective).toBe("Ship it")
    expect(state().known.ses_1).toBe(true)
  })

  test("a null event clears the goal but keeps the session known", () => {
    state().applyEvent("ses_1", goal())
    state().applyEvent("ses_1", null)
    expect(state().goals.ses_1).toBeUndefined()
    expect(state().known.ses_1).toBe(true)
  })

  test("an older revision of the same goal does not overwrite a newer one", () => {
    state().applyEvent("ses_1", goal({ status: "blocked", updatedAt: 300 }))
    state().applyEvent("ses_1", goal({ status: "active", updatedAt: 200 }))
    expect(state().goals.ses_1?.status).toBe("blocked")
  })

  test("an equal revision replaces the goal", () => {
    state().applyEvent("ses_1", goal({ status: "active", updatedAt: 300 }))
    state().applyEvent("ses_1", goal({ status: "paused", updatedAt: 300 }))
    expect(state().goals.ses_1?.status).toBe("paused")
  })

  test("a route read applies when no event arrived since it began", () => {
    const token = state().beginRead("ses_1")
    expect(state().applyRead("ses_1", goal(), token)).toBe(true)
    expect(state().goals.ses_1).toBeDefined()
  })

  test("a route read that began before an event is discarded", () => {
    const token = state().beginRead("ses_1")
    state().applyEvent("ses_1", goal({ status: "blocked", updatedAt: 500 }))
    expect(state().applyRead("ses_1", goal({ status: "active", updatedAt: 100 }), token)).toBe(false)
    expect(state().goals.ses_1?.status).toBe("blocked")
  })

  test("a read of no goal marks the session known without storing anything", () => {
    const token = state().beginRead("ses_1")
    expect(state().applyRead("ses_1", null, token)).toBe(true)
    expect(state().goals.ses_1).toBeUndefined()
    expect(state().known.ses_1).toBe(true)
  })

  test("remove forgets the session entirely", () => {
    state().applyEvent("ses_1", goal())
    state().remove("ses_1")
    expect(state().goals.ses_1).toBeUndefined()
    expect(state().known.ses_1).toBeUndefined()
    expect(state().eventSeq.ses_1).toBeUndefined()
  })

  test("goals of different sessions do not interact", () => {
    state().applyEvent("ses_1", goal())
    state().applyEvent("ses_2", goal({ sessionId: "ses_2", status: "blocked" }))
    state().remove("ses_1")
    expect(state().goals.ses_2?.status).toBe("blocked")
  })
})
