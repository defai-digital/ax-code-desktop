import { describe, expect, test } from "vitest"

import {
  deriveSupervisionState,
  isHighTouchState,
  isLiveState,
  needsHuman,
  nextNeedsHumanSession,
  rankSupervisionRows,
  resolveSupervisionEvidence,
  summarizeWorkInProgress,
  supervisionUrgency,
  treeStatePrecedence,
  type SupervisionStateInput,
} from "./sessionState"

const input = (overrides: Partial<SupervisionStateInput> = {}): SupervisionStateInput => ({
  id: "s1",
  projectId: "p1",
  permissionCount: 0,
  questionCount: 0,
  hasError: false,
  finishedWithUncommitted: false,
  statusType: "idle",
  ...overrides,
})

describe("deriveSupervisionState", () => {
  test("a pending permission outranks running", () => {
    expect(deriveSupervisionState(input({ permissionCount: 1, statusType: "busy" }))).toBe("permission")
  })

  test("a session working again outranks an unseen error", () => {
    expect(deriveSupervisionState(input({ hasError: true, statusType: "busy" }))).toBe("running")
  })

  test("a question outranks an error", () => {
    expect(deriveSupervisionState(input({ questionCount: 1, hasError: true }))).toBe("question")
  })

  test("running outranks finished-with-uncommitted, because the run has not finished", () => {
    expect(deriveSupervisionState(input({ finishedWithUncommitted: true, statusType: "retry" }))).toBe("running")
  })

  test("finished with uncommitted changes is ready to review", () => {
    expect(deriveSupervisionState(input({ finishedWithUncommitted: true }))).toBe("review")
  })

  test("nothing to do is idle", () => {
    expect(deriveSupervisionState(input())).toBe("idle")
  })

  test("a goal that needs a person is its own state when the session is not running", () => {
    expect(deriveSupervisionState(input({ goalNeedsPerson: true }))).toBe("goal")
  })

  test("running outranks a goal that needs a person", () => {
    expect(deriveSupervisionState(input({ goalNeedsPerson: true, statusType: "busy" }))).toBe("running")
    expect(deriveSupervisionState(input({ goalNeedsPerson: true, statusType: "retry" }))).toBe("running")
  })

  test("an error outranks a goal, and a goal outranks uncommitted work", () => {
    expect(deriveSupervisionState(input({ goalNeedsPerson: true, hasError: true }))).toBe("error")
    expect(deriveSupervisionState(input({ goalNeedsPerson: true, finishedWithUncommitted: true }))).toBe("goal")
  })

  test("a goal that does not need a person does not change the state", () => {
    expect(deriveSupervisionState(input({ goalNeedsPerson: false }))).toBe("idle")
    expect(deriveSupervisionState(input({ goalNeedsPerson: false, finishedWithUncommitted: true }))).toBe("review")
  })
})

describe("goal state classification", () => {
  test("counts as needing a person and live, but not high-touch", () => {
    expect(needsHuman("goal")).toBe(true)
    expect(isLiveState("goal")).toBe(true)
    expect(isHighTouchState("goal")).toBe(false)
  })

  test("urgency and tree precedence place goal between error and review", () => {
    expect(supervisionUrgency("error")).toBeLessThan(supervisionUrgency("goal"))
    expect(supervisionUrgency("goal")).toBeLessThan(supervisionUrgency("review"))
    expect(supervisionUrgency("goal")).toBeLessThan(supervisionUrgency("running"))
    expect(treeStatePrecedence("running")).toBeLessThan(treeStatePrecedence("error"))
    expect(treeStatePrecedence("error")).toBeLessThan(treeStatePrecedence("goal"))
    expect(treeStatePrecedence("goal")).toBeLessThan(treeStatePrecedence("review"))
    expect(treeStatePrecedence("goal")).toBeLessThan(treeStatePrecedence("idle"))
  })

  test("work in progress counts a goal as needing you, not as running or high-touch", () => {
    const summary = summarizeWorkInProgress([{ state: "goal" as const }, { state: "running" as const }])
    expect(summary).toEqual({ running: 1, needsYou: 1, highTouch: 1, overSoftLimit: false })
  })
})

describe("resolveSupervisionEvidence", () => {
  test("uses direct counts", () => {
    expect(resolveSupervisionEvidence({ additions: 10, deletions: "3", files: 2 })).toEqual({
      additions: 10,
      deletions: 3,
      files: 2,
    })
  })

  test("sums per-file diffs when direct counts are absent", () => {
    expect(resolveSupervisionEvidence({ diffs: [{ additions: 1, deletions: 2 }, { additions: "4" }] })).toEqual({
      additions: 5,
      deletions: 2,
      files: 2,
    })
  })

  test("no summary or an empty one is null", () => {
    expect(resolveSupervisionEvidence(undefined)).toBeNull()
    expect(resolveSupervisionEvidence({ additions: 0, deletions: 0 })).toBeNull()
  })
})

describe("ranking and navigation", () => {
  const rows = [
    { sessionId: "idle", state: "idle" as const, updatedAt: 50 },
    { sessionId: "run", state: "running" as const, updatedAt: 40 },
    { sessionId: "rev", state: "review" as const, updatedAt: 30 },
    { sessionId: "perm-new", state: "permission" as const, updatedAt: 20 },
    { sessionId: "perm-old", state: "permission" as const, updatedAt: 10 },
    { sessionId: "err", state: "error" as const, updatedAt: 5 },
  ]

  test("ranks blocked sessions first, oldest request first", () => {
    expect(rankSupervisionRows(rows).map((row) => row.sessionId)).toEqual([
      "perm-old",
      "perm-new",
      "err",
      "rev",
      "run",
      "idle",
    ])
  })

  test("next needs-human session walks the urgency order and wraps", () => {
    expect(nextNeedsHumanSession(rows, null)).toBe("perm-old")
    expect(nextNeedsHumanSession(rows, "perm-old")).toBe("perm-new")
    expect(nextNeedsHumanSession(rows, "rev")).toBe("perm-old")
    expect(nextNeedsHumanSession(rows, "run")).toBe("perm-old")
  })

  test("ranks a goal between an error and a review, and navigates to it", () => {
    const withGoal = [
      { sessionId: "rev", state: "review" as const, updatedAt: 30 },
      { sessionId: "goal", state: "goal" as const, updatedAt: 20 },
      { sessionId: "err", state: "error" as const, updatedAt: 10 },
      { sessionId: "run", state: "running" as const, updatedAt: 40 },
    ]
    expect(rankSupervisionRows(withGoal).map((row) => row.sessionId)).toEqual(["err", "goal", "rev", "run"])
    expect(nextNeedsHumanSession(withGoal, null)).toBe("err")
    expect(nextNeedsHumanSession(withGoal, "err")).toBe("goal")
  })

  test("returns null when nothing needs a person", () => {
    expect(nextNeedsHumanSession([{ sessionId: "a", state: "running", updatedAt: 1 }], null)).toBeNull()
  })

  test("summarizes work in progress with a soft limit", () => {
    expect(summarizeWorkInProgress(rows)).toEqual({ running: 1, needsYou: 4, highTouch: 3, overSoftLimit: false })
    const busy = Array.from({ length: 5 }, (_, index) => ({ state: "running" as const, sessionId: `${index}` }))
    expect(summarizeWorkInProgress(busy).overSoftLimit).toBe(true)
  })
})
