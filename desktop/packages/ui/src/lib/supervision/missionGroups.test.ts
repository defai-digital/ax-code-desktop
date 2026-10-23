import { describe, expect, test } from "vitest"
import type { SupervisionRow } from "./rows"
import { groupMissionRows } from "./missionGroups"

const row = (sessionId: string, overrides: Partial<SupervisionRow> = {}): SupervisionRow => ({
  sessionId,
  title: sessionId,
  state: "running",
  treeSessionIds: [sessionId],
  projectId: "alpha",
  projectLabel: "Alpha",
  directory: "/home/me/alpha",
  updatedAt: 1,
  evidence: null,
  goal: null,
  ...overrides,
})

describe("groupMissionRows", () => {
  test("preserves first project occurrence and input order within projects without mutating rows", () => {
    const rows = Object.freeze([
      Object.freeze(row("b1", { projectId: "beta", projectLabel: "Beta", state: "permission" })),
      Object.freeze(row("a1", { state: "question" })),
      Object.freeze(row("b2", { projectId: "beta" })),
      Object.freeze(row("a2")),
    ])
    const groups = groupMissionRows(rows, "/home/me")
    expect(groups.map((group) => group.key)).toEqual(["beta", "alpha"])
    expect(groups.map((group) => group.rows.map((item) => item.sessionId))).toEqual([
      ["b1", "b2"],
      ["a1", "a2"],
    ])
    expect(groups[0].rows[0]).toBe(rows[0])
    expect(groups[0].label).toBe("Beta")
  })

  test("counts only the decision states as needing you and sums only reported evidence", () => {
    const rows = (["permission", "question", "error", "goal", "review", "running", "idle"] as const).map((state) =>
      row(state, { state }),
    )
    rows[0].evidence = { additions: 3, deletions: 1, files: 2 }
    rows[5].evidence = { additions: 7, deletions: 4, files: 3 }
    expect(groupMissionRows(rows, null)[0]).toMatchObject({
      needsYou: 3,
      running: 1,
      evidence: { additions: 10, deletions: 5, files: 5 },
    })
    expect(rows[0].evidence).toEqual({ additions: 3, deletions: 1, files: 2 })
  })

  test("uses directory keys and short labels when no project is registered; absent evidence stays null", () => {
    const groups = groupMissionRows([row("a", { projectId: null, projectLabel: null })], "/home/me")
    expect(groups[0]).toMatchObject({
      key: "/home/me/alpha",
      label: "~/alpha",
      directory: "/home/me/alpha",
      evidence: null,
    })
  })

  test("collects missing projects under __none__ with a translation-free null label", () => {
    const rows = [
      row("a", { projectId: null, projectLabel: null, directory: null }),
      row("b", { projectId: null, projectLabel: null, directory: null }),
    ]
    expect(groupMissionRows(rows, null)).toEqual([
      {
        key: "__none__",
        label: null,
        directory: null,
        rows,
        needsYou: 0,
        running: 2,
        evidence: null,
      },
    ])
    expect(groupMissionRows([], null)).toEqual([])
  })
})
