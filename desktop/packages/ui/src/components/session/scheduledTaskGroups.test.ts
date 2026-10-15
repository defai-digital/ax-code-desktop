import { describe, expect, it } from "vitest"
import type { ProjectEntry } from "@/lib/api/types"
import { buildProjectGroups, buildTaskRowKey, mapWithConcurrencyLimit, normalizeDirectory } from "./scheduledTaskGroups"

const project = (id: string, path: string): ProjectEntry => ({ id, path })

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

  it("skips empty paths", () => {
    expect(buildProjectGroups([project("1", "  "), project("2", "/repo/a")])).toHaveLength(1)
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
