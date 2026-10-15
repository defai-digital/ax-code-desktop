import { describe, expect, test } from "vitest"

import {
  deriveSupervisionState,
  nextNeedsHumanSession,
  rankSupervisionRows,
  resolveSupervisionEvidence,
  summarizeWorkInProgress,
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

  test("returns null when nothing needs a person", () => {
    expect(nextNeedsHumanSession([{ sessionId: "a", state: "running", updatedAt: 1 }], null)).toBeNull()
  })

  test("summarizes work in progress with a soft limit", () => {
    expect(summarizeWorkInProgress(rows)).toEqual({ running: 1, needsYou: 4, highTouch: 3, overSoftLimit: false })
    const busy = Array.from({ length: 5 }, (_, index) => ({ state: "running" as const, sessionId: `${index}` }))
    expect(summarizeWorkInProgress(busy).overSoftLimit).toBe(true)
  })
})
