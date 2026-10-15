import { describe, expect, it } from "vitest"
import type { ProjectEntry } from "@/lib/api/types"
import type { ScheduledTask } from "@/lib/scheduledTasksApi"
import {
  ALL_PROJECTS_VALUE,
  buildDirectoryToProjectMap,
  buildProjectGroups,
  buildTaskRowKey,
  computeSummary,
  directoryForTask,
  groupDirectoryForTask,
  mapWithConcurrencyLimit,
  normalizeDirectory,
  resolveEventTargetDirectories,
  sortScheduledTasks,
} from "./scheduledTaskGroups"

const project = (id: string, path: string): ProjectEntry => ({ id, path })

const task = (overrides: Partial<ScheduledTask>): ScheduledTask => ({
  id: "task-1",
  directory: "/repo/a",
  title: "Task",
  prompt: "Do it",
  schedule: { type: "daily", time: "09:00" } as ScheduledTask["schedule"],
  status: "active",
  catchUpPolicy: "run_once",
  lastRunStatus: "idle",
  time: { created: 1 },
  ...overrides,
})

describe("normalizeDirectory", () => {
  it("trims and strips trailing slashes except root", () => {
    expect(normalizeDirectory("  /repo/a/  ")).toBe("/repo/a")
    expect(normalizeDirectory("/repo/a///")).toBe("/repo/a")
    expect(normalizeDirectory("/")).toBe("/")
    expect(normalizeDirectory("///")).toBe("/")
    expect(normalizeDirectory("")).toBe("")
    expect(normalizeDirectory("   ")).toBe("")
    expect(normalizeDirectory(null)).toBe("")
    expect(normalizeDirectory(undefined)).toBe("")
  })
})

describe("buildProjectGroups", () => {
  it("dedupes projects sharing a normalized path, first wins, order preserved", () => {
    const groups = buildProjectGroups([
      project("1", "/repo/a/"),
      project("2", "/repo/b"),
      project("3", " /repo/a "),
      project("4", "/repo/b/"),
      project("5", "/repo/c"),
    ])
    expect(groups.map((group) => group.directory)).toEqual(["/repo/a", "/repo/b", "/repo/c"])
    expect(groups.map((group) => group.project.id)).toEqual(["1", "2", "5"])
  })

  it("skips empty paths and builds the directory map", () => {
    expect(buildProjectGroups([project("1", "  "), project("2", "/repo/a")])).toHaveLength(1)
    const map = buildDirectoryToProjectMap([project("1", "/repo/a/"), project("2", "/repo/a")])
    expect(map.get("/repo/a")?.id).toBe("1")
  })

  it("exposes the All projects sentinel", () => {
    expect(ALL_PROJECTS_VALUE).toBe("__all")
  })
})

describe("sortScheduledTasks", () => {
  it("sorts active first, then title, then next run, without mutating input", () => {
    const input = [
      task({ id: "paused-b", title: "Beta", status: "paused" }),
      task({ id: "active-b", title: "Beta", status: "active", nextRunAt: 200 }),
      task({ id: "active-a2", title: "Alpha", status: "active", nextRunAt: 300 }),
      task({ id: "active-a1", title: "Alpha", status: "active", nextRunAt: 100 }),
      task({ id: "paused-none", title: "Alpha", status: "paused" }),
    ]
    const sorted = sortScheduledTasks(input)
    expect(sorted.map((item) => item.id)).toEqual(["active-a1", "active-a2", "active-b", "paused-none", "paused-b"])
    expect(input.map((item) => item.id)).toEqual(["paused-b", "active-b", "active-a2", "active-a1", "paused-none"])
  })
})

describe("computeSummary", () => {
  it("counts only loaded groups and reports unavailable separately", () => {
    const summary = computeSummary([
      {
        directory: "/repo/a",
        tasks: [
          task({ id: "1", status: "active", lastRunStatus: "running" }),
          task({ id: "2", status: "paused", lastRunStatus: "error" }),
          task({ id: "3", status: "active", lastRunStatus: "success" }),
        ],
      },
      { directory: "/repo/b", tasks: [task({ id: "4", status: "active" })] },
      { directory: "/repo/c", tasks: [task({ id: "5", status: "active" })], error: "boom" },
    ])
    expect(summary).toEqual({ active: 3, total: 4, projects: 2, running: 1, failing: 1, unavailable: 1 })
  })

  it("respects explicit hasLoaded over the error heuristic", () => {
    const summary = computeSummary([
      { directory: "/repo/a", tasks: [task({ id: "1" })], error: "refresh failed", hasLoaded: true },
    ])
    expect(summary).toEqual({ active: 1, total: 1, projects: 1, running: 0, failing: 0, unavailable: 1 })
  })

  it("returns zeros for no groups", () => {
    expect(computeSummary([])).toEqual({ active: 0, total: 0, projects: 0, running: 0, failing: 0, unavailable: 0 })
  })

  it("counts family-shaped items once, active when any member is active", () => {
    const summary = computeSummary([
      {
        directory: "/repo/a",
        tasks: [
          { status: "mixed", lastRunStatus: "running", anyActive: true },
          { status: "paused", lastRunStatus: "error", anyActive: false },
        ],
      },
    ])
    expect(summary).toEqual({ active: 1, total: 2, projects: 1, running: 1, failing: 1, unavailable: 0 })
  })
})

describe("resolveEventTargetDirectories", () => {
  const known = ["/repo/a", "/repo/b"]

  it("reloads all groups when the event has no directory", () => {
    expect(resolveEventTargetDirectories(undefined, known)).toEqual(["/repo/a", "/repo/b"])
    expect(resolveEventTargetDirectories("", known)).toEqual(["/repo/a", "/repo/b"])
    expect(resolveEventTargetDirectories(null, known)).toEqual(["/repo/a", "/repo/b"])
  })

  it("reloads only the matching normalized group", () => {
    expect(resolveEventTargetDirectories("/repo/a/", known)).toEqual(["/repo/a"])
    expect(resolveEventTargetDirectories(" /repo/b ", known)).toEqual(["/repo/b"])
  })

  it("ignores unknown directories", () => {
    expect(resolveEventTargetDirectories("/repo/elsewhere", known)).toEqual([])
  })

  it("normalizes and dedupes the known list", () => {
    expect(resolveEventTargetDirectories(undefined, ["/repo/a/", "/repo/a", "/repo/b"])).toEqual(["/repo/a", "/repo/b"])
  })
})

describe("buildTaskRowKey", () => {
  it("separates directory and id with NUL so same id in different projects differs", () => {
    expect(buildTaskRowKey("/repo/a", "1")).toBe("/repo/a\u00001")
    expect(buildTaskRowKey("/repo/a/", "1")).toBe(buildTaskRowKey("/repo/a", "1"))
    expect(buildTaskRowKey("/repo/a", "1")).not.toBe(buildTaskRowKey("/repo/b", "1"))
    expect(buildTaskRowKey("/repo/a", "1")).not.toBe(buildTaskRowKey("/repo/a", "2"))
  })
})

describe("task directory resolution", () => {
  it("normalizes the task directory and maps through known groups", () => {
    expect(directoryForTask(task({ directory: "/repo/a/" }))).toBe("/repo/a")
    expect(groupDirectoryForTask(task({ directory: "/repo/a/" }), ["/repo/a", "/repo/b"])).toBe("/repo/a")
    expect(groupDirectoryForTask(task({ directory: "/other/" }), ["/repo/a"])).toBe("/other")
  })
})

describe("mapWithConcurrencyLimit", () => {
  it("preserves order and never exceeds the limit", async () => {
    let inFlight = 0
    let maxInFlight = 0
    const result = await mapWithConcurrencyLimit([1, 2, 3, 4, 5], 2, async (value) => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight -= 1
      return value * 10
    })
    expect(result).toEqual([10, 20, 30, 40, 50])
    expect(maxInFlight).toBe(2)
  })

  it("handles empty input", async () => {
    await expect(mapWithConcurrencyLimit([], 3, async (value: number) => value)).resolves.toEqual([])
  })
})
