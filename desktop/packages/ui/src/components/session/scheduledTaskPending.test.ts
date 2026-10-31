import { describe, expect, it } from "vitest"

import type { ProjectEntry } from "@/lib/api/types"
import type { ScheduledTask } from "@/lib/scheduledTasksApi"
import { buildPendingEntries, pendingRank, selectDueReloads, summarizePendingEntries } from "./scheduledTaskPending"
import { groupScheduledTaskFamilies } from "./scheduledTaskFamilies"

const alpha: ProjectEntry = { id: "p-alpha", path: "/work/alpha" }
const beta: ProjectEntry = { id: "p-beta", path: "/work/beta" }

const task = (overrides: Partial<ScheduledTask> & { id: string; title: string }): ScheduledTask => ({
  directory: "/work/alpha",
  prompt: "Do it",
  schedule: { type: "daily", time: "09:00", timezone: "UTC" },
  status: "active",
  catchUpPolicy: "run_once",
  lastRunStatus: "idle",
  time: { created: 1 },
  ...overrides,
})

const family = (overrides: Partial<ScheduledTask> & { id: string; title: string }) =>
  groupScheduledTaskFamilies([task(overrides)])[0]

describe("pendingRank", () => {
  it("orders running, failing, scheduled, unscheduled, paused", () => {
    expect(pendingRank(family({ id: "a", title: "A", lastRunStatus: "running", status: "paused" }))).toBe(0)
    expect(pendingRank(family({ id: "b", title: "B", lastRunStatus: "error", lastRunAt: 1, nextRunAt: 5 }))).toBe(1)
    expect(pendingRank(family({ id: "c", title: "C", nextRunAt: 5 }))).toBe(2)
    expect(pendingRank(family({ id: "d", title: "D" }))).toBe(3)
    expect(pendingRank(family({ id: "e", title: "E", status: "paused", nextRunAt: 5 }))).toBe(4)
    // A paused task whose last run failed is still paused, not "failing".
    expect(pendingRank(family({ id: "f", title: "F", status: "paused", lastRunStatus: "error", lastRunAt: 1 }))).toBe(4)
  })
})

describe("buildPendingEntries", () => {
  it("merges projects into one queue ordered by state, then soonest next run", () => {
    const entries = buildPendingEntries([
      {
        directory: "/work/alpha",
        project: alpha,
        tasks: [
          task({ id: "a1", title: "Later", nextRunAt: 3_000 }),
          task({ id: "a2", title: "Paused", status: "paused", nextRunAt: 100 }),
          task({ id: "a3", title: "Unscheduled" }),
        ],
      },
      {
        directory: "/work/beta",
        project: beta,
        tasks: [
          task({ id: "b1", directory: "/work/beta", title: "Soon", nextRunAt: 1_000 }),
          task({ id: "b2", directory: "/work/beta", title: "Running", lastRunStatus: "running", nextRunAt: 9_000 }),
          task({
            id: "b3",
            directory: "/work/beta",
            title: "Broken",
            lastRunStatus: "error",
            lastRunAt: 1,
            nextRunAt: 8_000,
          }),
        ],
      },
    ])
    expect(entries.map((entry) => entry.family.title)).toEqual([
      "Running",
      "Broken",
      "Soon",
      "Later",
      "Unscheduled",
      "Paused",
    ])
    expect(entries.find((entry) => entry.family.title === "Soon")?.project).toBe(beta)
  })

  it("keeps same-id tasks in different projects apart and breaks ties deterministically", () => {
    const entries = buildPendingEntries([
      { directory: "/work/beta", project: beta, tasks: [task({ id: "x", directory: "/work/beta", title: "Same" })] },
      { directory: "/work/alpha", project: alpha, tasks: [task({ id: "x", title: "Same" })] },
    ])
    expect(entries).toHaveLength(2)
    expect(new Set(entries.map((entry) => entry.key)).size).toBe(2)
    expect(entries.map((entry) => entry.directory)).toEqual(["/work/alpha", "/work/beta"])
  })

  it("folds fan-out parts into one entry", () => {
    const entries = buildPendingEntries([
      {
        directory: "/work/alpha",
        project: alpha,
        tasks: [
          task({ id: "p1", title: "Digest (1/2)", schedule: { type: "daily", time: "09:00", timezone: "UTC" } }),
          task({ id: "p2", title: "Digest (2/2)", schedule: { type: "daily", time: "18:00", timezone: "UTC" } }),
        ],
      },
    ])
    expect(entries).toHaveLength(1)
    expect(entries[0].family.members).toHaveLength(2)
  })
})

describe("summarizePendingEntries", () => {
  it("counts states and finds the soonest active run", () => {
    const entries = buildPendingEntries([
      {
        directory: "/work/alpha",
        project: alpha,
        tasks: [
          task({ id: "a", title: "A", nextRunAt: 5_000 }),
          task({ id: "b", title: "B", nextRunAt: 2_000, lastRunStatus: "error", lastRunAt: 1 }),
          task({ id: "c", title: "C", status: "paused", nextRunAt: 1_000 }),
          task({ id: "d", title: "D", lastRunStatus: "running" }),
        ],
      },
    ])
    expect(summarizePendingEntries(entries)).toEqual({
      total: 4,
      active: 3,
      running: 1,
      failing: 1,
      nextRunAt: 2_000,
    })
    expect(summarizePendingEntries([])).toEqual({ total: 0, active: 0, running: 0, failing: 0 })
  })
})

describe("selectDueReloads", () => {
  const entries = buildPendingEntries([
    { directory: "/work/alpha", project: alpha, tasks: [task({ id: "a", title: "A", nextRunAt: 10_000 })] },
    {
      directory: "/work/beta",
      project: beta,
      tasks: [
        task({ id: "b", directory: "/work/beta", title: "B", nextRunAt: 50_000 }),
        task({ id: "c", directory: "/work/beta", title: "C", status: "paused", nextRunAt: 1_000 }),
      ],
    },
  ])
  const options = { graceMs: 5_000, minIntervalMs: 60_000 }

  it("reloads a project once an active run is past the grace period", () => {
    expect(selectDueReloads(entries, 14_000, new Map(), options)).toEqual([])
    expect(selectDueReloads(entries, 15_000, new Map(), options)).toEqual(["/work/alpha"])
    expect(selectDueReloads(entries, 60_000, new Map(), options)).toEqual(["/work/alpha", "/work/beta"])
  })

  it("does not reload the same project again within the minimum interval", () => {
    const last = new Map([["/work/alpha", 20_000]])
    expect(selectDueReloads(entries, 30_000, last, options)).toEqual([])
    expect(selectDueReloads(entries, 80_000, last, options)).toEqual(["/work/alpha", "/work/beta"])
  })
})

describe("completed one-time tasks", () => {
  const completed = family({
    id: "done",
    title: "Done",
    schedule: { type: "once", runAt: 1 },
    status: "disabled",
    lastRunAt: 1,
    lastRunStatus: "success",
  })

  it("ranks them below paused tasks", () => {
    expect(pendingRank(completed)).toBe(5)
    expect(pendingRank(family({ id: "e", title: "E", status: "paused" }))).toBe(4)
  })

  it("does not count a paused or completed task's old failure as failing", () => {
    const entries = buildPendingEntries([
      {
        directory: "/work/alpha",
        project: alpha,
        tasks: [
          task({ id: "a", title: "A", status: "paused", lastRunStatus: "error", lastRunAt: 1 }),
          task({ id: "b", title: "B", nextRunAt: 5, lastRunStatus: "error", lastRunAt: 1 }),
          task({ id: "c", title: "C", status: "disabled", lastRunStatus: "error", lastRunAt: 1 }),
        ],
      },
    ])
    expect(summarizePendingEntries(entries)).toMatchObject({ total: 3, active: 1, failing: 1 })
  })
})
