import { describe, expect, test } from "vitest"

import {
  filterMissionFacets,
  missionProjectKey,
  filterRows,
  moveSelection,
  primaryActionFor,
  searchMissionRows,
  matchesMissionStatus,
} from "./missionControl"
import type { SupervisionState } from "./sessionState"

const NOW = 1_700_000_000_000
const row = (sessionId: string, state: SupervisionState, updatedAt = NOW) => ({ sessionId, state, updatedAt })
const sets = [{ id: "ws1", name: "Focus", sessionIds: ["a", "c"] }]

describe("search and status facets", () => {
  const rows = [
    {
      ...row("a", "goal"),
      title: "Same title",
      projectLabel: "Shared",
      directory: "/repo/alpha",
      goal: { objective: "Ship migration" },
    },
    { ...row("b", "running"), title: "Same title", projectLabel: "Shared", directory: "/repo/beta" },
    { ...row("c", "review"), title: "Patch", projectLabel: "Other", directory: "/repo/gamma" },
  ]
  test("searches title, project, directory and objective without changing urgency order", () => {
    expect(searchMissionRows(rows, " SAME ").map((r) => r.sessionId)).toEqual(["a", "b"])
    expect(searchMissionRows(rows, "SHARED").map((r) => r.sessionId)).toEqual(["a", "b"])
    expect(searchMissionRows(rows, "/repo/beta").map((r) => r.sessionId)).toEqual(["b"])
    expect(searchMissionRows(rows, "migration").map((r) => r.sessionId)).toEqual(["a"])
    expect(searchMissionRows(rows, "  ")).toEqual(rows)
  })
  test("scope and query constrain status counts, and categories do not overlap", () => {
    const scoped = filterRows(rows, { kind: "workingSet", workingSetId: "ws1" }, sets, NOW)
    const searched = searchMissionRows(scoped, "repo")
    expect(searched.map((r) => r.sessionId)).toEqual(["a", "c"])
    const counts = ["attention", "running", "review"].map(
      (status) =>
        searched.filter((r) => matchesMissionStatus(r.state, status as "attention" | "running" | "review")).length,
    )
    expect(counts).toEqual([1, 0, 1])
    expect(counts.reduce((a, b) => a + b)).toBe(searched.length)
    expect(searched.filter((r) => matchesMissionStatus(r.state, "review")).map((r) => r.sessionId)).toEqual(["c"])
  })
})

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
  test("live includes a goal that needs a person", () => {
    const withGoal = [...rows, row("g", "goal")]
    expect(filterRows(withGoal, { kind: "live" }, sets, NOW).map((r) => r.sessionId)).toEqual(["a", "d", "g"])
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
    expect(primaryActionFor("goal")).toBe("open")
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

describe("compound mission facets", () => {
  const rows = [
    {
      ...row("a", "running"),
      title: "Ship API",
      projectId: "alpha",
      projectLabel: "Shared",
      directory: "/a",
      evidence: { files: 1, additions: 2, deletions: 0 },
      goal: null,
    },
    {
      ...row("b", "permission"),
      title: "Ship UI",
      projectId: "beta",
      projectLabel: "Shared",
      directory: "/b",
      evidence: null,
      goal: null,
    },
    {
      ...row("c", "running"),
      title: "Ship docs",
      projectId: "beta",
      projectLabel: "Shared",
      directory: "/b",
      evidence: { files: 1, additions: 0, deletions: 1 },
      goal: null,
    },
    {
      ...row("d", "running"),
      title: "Ship API",
      projectId: "gamma",
      projectLabel: "Other",
      directory: "/g",
      evidence: null,
      goal: null,
    },
  ]
  const facets = { query: "", status: "all" as const, projectKeys: [], hasChanges: false }
  test("ANDs search, status, projects and evidence while ORing selected projects", () => {
    expect(filterMissionFacets(rows, { ...facets, projectKeys: ["alpha", "beta"] }).map((r) => r.sessionId)).toEqual([
      "a",
      "b",
      "c",
    ])
    expect(
      filterMissionFacets(rows, {
        ...facets,
        query: "ship",
        projectKeys: ["beta"],
        status: "running",
        hasChanges: true,
      }).map((r) => r.sessionId),
    ).toEqual(["c"])
    expect(
      filterMissionFacets(rows, {
        ...facets,
        query: "API",
        projectKeys: ["beta"],
        status: "running",
        hasChanges: true,
      }),
    ).toEqual([])
    expect(
      filterMissionFacets(rows, { ...facets, projectKeys: ["beta"], status: "attention", hasChanges: true }),
    ).toEqual([])
  })
  test("empty project set does not restrict results and evidence is independent of status", () => {
    expect(filterMissionFacets(rows, facets)).toEqual(rows)
    expect(filterMissionFacets(rows, { ...facets, hasChanges: true }).map((r) => r.sessionId)).toEqual(["a", "c"])
    expect(filterMissionFacets(rows, { ...facets, projectKeys: ["missing"] })).toEqual([])
  })
  test("uses project identity rather than duplicate labels, with directory and no-project fallbacks", () => {
    expect(filterMissionFacets(rows, { ...facets, projectKeys: ["alpha"] }).map((r) => r.sessionId)).toEqual(["a"])
    expect(missionProjectKey({ projectId: null, directory: "/local" })).toBe("/local")
    expect(missionProjectKey({ projectId: null, directory: null })).toBe("__none__")
  })
})
