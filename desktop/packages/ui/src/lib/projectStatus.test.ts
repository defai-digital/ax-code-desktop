import { describe, expect, test } from "vitest"
import { deriveProjectActivity } from "./projectStatus"

describe("deriveProjectActivity", () => {
  const projects = [
    { id: "app", path: "/Users/dev/app" },
    { id: "app-docs", path: "/Users/dev/app/docs" },
    { id: "other", path: "/Users/dev/other" },
  ]

  test("reports idle projects with zero counts instead of a fake status", () => {
    const result = deriveProjectActivity({
      projects,
      sessions: [],
      statuses: {},
      pendingPermissionSessionIds: new Set(),
    })
    expect(result.get("app")).toEqual({ tone: "idle", activeSessions: 0, busySessions: 0, pendingApprovals: 0 })
    expect(result.size).toBe(3)
  })

  test("counts busy sessions in the project folder and its worktrees", () => {
    const result = deriveProjectActivity({
      projects,
      sessions: [
        { id: "s1", directory: "/Users/dev/app" },
        { id: "s2", directory: "/Users/dev/app/.worktrees/feature" },
        { id: "s3", directory: "/Users/dev/app/", archived: true },
      ],
      statuses: { s1: { type: "busy" }, s2: { type: "idle" } },
      pendingPermissionSessionIds: new Set(),
    })
    expect(result.get("app")).toEqual({ tone: "running", activeSessions: 2, busySessions: 1, pendingApprovals: 0 })
  })

  test("attributes nested project sessions to the nearest project", () => {
    const result = deriveProjectActivity({
      projects,
      sessions: [{ id: "s1", directory: "/Users/dev/app/docs" }],
      statuses: { s1: { type: "busy" } },
      pendingPermissionSessionIds: new Set(),
    })
    expect(result.get("app-docs")?.busySessions).toBe(1)
    expect(result.get("app")?.activeSessions).toBe(0)
  })

  test("pending approvals win over running", () => {
    const result = deriveProjectActivity({
      projects,
      sessions: [
        { id: "s1", directory: "/Users/dev/other" },
        { id: "s2", directory: "/Users/dev/other" },
      ],
      statuses: { s1: { type: "busy" }, s2: { type: "busy" } },
      pendingPermissionSessionIds: new Set(["s2"]),
    })
    expect(result.get("other")).toEqual({ tone: "attention", activeSessions: 2, busySessions: 2, pendingApprovals: 1 })
  })

  test("ignores sessions outside every project", () => {
    const result = deriveProjectActivity({
      projects,
      sessions: [
        { id: "s1", directory: "/Users/dev/elsewhere" },
        { id: "s2", directory: "/Users/dev/other/" },
      ],
      statuses: { s1: { type: "busy" }, s2: { type: "busy" } },
      pendingPermissionSessionIds: new Set(),
    })
    expect(result.get("other")?.busySessions).toBe(1)
    expect([...result.values()].reduce((sum, item) => sum + item.activeSessions, 0)).toBe(1)
  })

  test("attributes a managed worktree outside the project folder through its recorded root", () => {
    const result = deriveProjectActivity({
      projects,
      sessions: [
        { id: "s1", directory: "/Users/dev/.ax-code/worktrees/other/feature", projectDirectory: "/Users/dev/other" },
      ],
      statuses: { s1: { type: "busy" } },
      pendingPermissionSessionIds: new Set(["s1"]),
    })
    expect(result.get("other")).toEqual({ tone: "attention", activeSessions: 1, busySessions: 1, pendingApprovals: 1 })
  })
})
