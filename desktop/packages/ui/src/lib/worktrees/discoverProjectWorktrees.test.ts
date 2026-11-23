import { describe, expect, test } from "vitest"
import type { WorktreeMetadata } from "@/types/worktree"
import { discoverProjectWorktrees } from "./discoverProjectWorktrees"

const worktree = (path: string) => ({ path, projectDirectory: "/a" }) as unknown as WorktreeMetadata

describe("discoverProjectWorktrees (C UX-03)", () => {
  test("a successful listing marks its project ready, an empty listing included", async () => {
    const result = await discoverProjectWorktrees(
      [
        { id: "a", path: "/a" },
        { id: "b", path: "/b" },
        { id: "plain", path: "/plain" },
      ],
      {
        isGitRepo: async (path) => path !== "/plain",
        listWorktrees: async ({ path }) => (path === "/a" ? [worktree("/a/.wt/one")] : []),
        isCancelled: () => false,
      },
    )
    expect([...result.readyProjectPaths].sort()).toEqual(["/a", "/b"])
    // Not listed: "not a repository" may be a failed probe, so it is no proof a worktree is gone.
    expect(result.readyProjectIds.has("plain")).toBe(true)
    expect(result.worktreesByProject.get("/a")?.map((item) => item.path)).toEqual(["/a/.wt/one"])
    expect(result.worktreesByProject.has("/b")).toBe(false)
  })

  test("a failed listing leaves its project unknown without hiding the others", async () => {
    const result = await discoverProjectWorktrees(
      [
        { id: "a", path: "/a" },
        { id: "b", path: "/b" },
      ],
      {
        isGitRepo: async () => true,
        listWorktrees: async ({ path }) => {
          if (path === "/b") throw new Error("git failed")
          return [worktree("/a/.wt/one")]
        },
        isCancelled: () => false,
      },
    )
    expect([...result.readyProjectPaths]).toEqual(["/a"])
    expect(result.readyProjectIds.has("b")).toBe(false)
    expect(result.allWorktrees).toHaveLength(1)
  })

  test("a failed git check also leaves the project unknown, and an unresolved path is skipped", async () => {
    const result = await discoverProjectWorktrees(
      [
        { id: "a", path: "/a" },
        { id: "none", path: null },
      ],
      {
        isGitRepo: async () => {
          throw new Error("offline")
        },
        listWorktrees: async () => [],
        isCancelled: () => false,
      },
    )
    expect(result.readyProjectPaths.size).toBe(0)
  })
})
