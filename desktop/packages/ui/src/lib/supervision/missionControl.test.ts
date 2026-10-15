import { describe, expect, test } from "vitest"

import { filterRows, moveSelection, primaryActionFor } from "./missionControl"
import type { SupervisionState } from "./sessionState"

const NOW = 1_700_000_000_000
const row = (sessionId: string, state: SupervisionState, updatedAt = NOW) => ({ sessionId, state, updatedAt })
const sets = [{ id: "ws1", name: "Focus", sessionIds: ["a", "c"] }]

describe("filterRows", () => {
  const rows = [
    row("a", "running"),
    row("b", "idle"),
    row("c", "idle", NOW - 1000),
    row("d", "review", NOW - 25 * 3600_000),
  ]
  test("live keeps non-idle only", () => {
    expect(filterRows(rows, { kind: "live" }, sets, NOW).map((r) => r.sessionId)).toEqual(["a", "d"])
  })
  test("recent keeps last 24h regardless of state", () => {
    expect(filterRows(rows, { kind: "recent" }, sets, NOW).map((r) => r.sessionId)).toEqual(["a", "b", "c"])
  })
  test("working set includes idle and only members", () => {
    expect(filterRows(rows, { kind: "workingSet", workingSetId: "ws1" }, sets, NOW).map((r) => r.sessionId)).toEqual([
      "a",
      "c",
    ])
    expect(filterRows(rows, { kind: "workingSet", workingSetId: "missing" }, sets, NOW)).toEqual([])
  })
})

describe("primaryActionFor", () => {
  test("maps each state", () => {
    expect(primaryActionFor("permission")).toBe("review-request")
    expect(primaryActionFor("question")).toBe("answer")
    expect(primaryActionFor("error")).toBe("open")
    expect(primaryActionFor("review")).toBe("review-changes")
    expect(primaryActionFor("running")).toBe("open")
    expect(primaryActionFor("idle")).toBe("open")
  })
})

describe("moveSelection", () => {
  test("clamps at both ends", () => {
    expect(moveSelection(0, -1, 3)).toBe(0)
    expect(moveSelection(2, 1, 3)).toBe(2)
    expect(moveSelection(0, 1, 3)).toBe(1)
    expect(moveSelection(1, -1, 3)).toBe(0)
  })
  test("handles empty and unselected", () => {
    expect(moveSelection(0, 1, 0)).toBe(-1)
    expect(moveSelection(-1, 1, 3)).toBe(0)
    expect(moveSelection(-1, -1, 3)).toBe(2)
  })
})
