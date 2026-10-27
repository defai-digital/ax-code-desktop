import { describe, expect, test } from "vitest"
import type { ProjectEntry } from "@/lib/api/types"
import type { WorktreeMetadata } from "@/types/worktree"

import {
  projectPathIsInsideRoot,
  projectPathMatchesRoot,
  resolveProjectForDirectory,
  resolveProjectForSessionDirectory,
} from "./projectResolution"

const project = (id: string, path: string): ProjectEntry => ({
  id,
  path,
  label: id,
})

const worktree = (path: string, projectDirectory: string): WorktreeMetadata => ({
  path,
  projectDirectory,
  branch: "main",
  label: "main",
})

describe("resolveProjectForDirectory", () => {
  test("matches Windows drive paths case-insensitively", () => {
    const projects = [project("app", "C:/Users/Alice/Project")]

    expect(resolveProjectForDirectory(projects, "c:/Users/Alice/Project/src")?.id).toBe("app")
  })

  test("matches child paths under a Windows drive root project", () => {
    const projects = [project("drive", "C:/")]

    expect(resolveProjectForDirectory(projects, "C:/Users/Alice/Project")?.id).toBe("drive")
  })

  test("keeps POSIX path matching case-sensitive", () => {
    const projects = [project("app", "/Users/Alice/Project")]

    expect(resolveProjectForDirectory(projects, "/users/Alice/Project/src")).toBeNull()
  })
})

describe("resolveProjectForSessionDirectory", () => {
  test("resolves Windows worktree paths case-insensitively", () => {
    const projects = [project("app", "C:/Users/Alice/Project")]
    const worktrees = new Map<string, WorktreeMetadata[]>([
      ["C:/Users/Alice/Project", [worktree("C:/Users/Alice/Project/.worktrees/Feature", "C:/Users/Alice/Project")]],
    ])

    expect(
      resolveProjectForSessionDirectory(projects, worktrees, "c:/Users/Alice/Project/.worktrees/Feature/src")?.id,
    ).toBe("app")
  })
})

describe("worktree ownership precedence", () => {
  test("keeps a nested registered project inside the main checkout", () => {
    const projects = [project("parent", "/repo"), project("nested", "/repo/packages/ui")]
    const worktrees = new Map([["/repo", [worktree("/repo", "/repo")]]])
    expect(resolveProjectForSessionDirectory(projects, worktrees, "/repo/packages/ui/src")?.id).toBe("nested")
  })

  test("keeps an explicitly registered project inside a linked worktree", () => {
    const projects = [project("parent", "/repo"), project("nested", "/wt/packages/ui")]
    const worktrees = new Map([["/repo", [worktree("/wt", "/repo")]]])
    expect(resolveProjectForSessionDirectory(projects, worktrees, "/wt/packages/ui/src")?.id).toBe("nested")
    expect(resolveProjectForSessionDirectory(projects, worktrees, "/wt/src")?.id).toBe("parent")
  })

  test("prefers the exact map owner over an ancestor of stale metadata", () => {
    const projects = [project("broad", "/work"), project("owner", "/projects/app")]
    const worktrees = new Map([["/projects/app", [worktree("/tmp/wt", "/work/legacy/app")]]])
    expect(resolveProjectForSessionDirectory(projects, worktrees, "/tmp/wt")?.id).toBe("owner")
  })

  test("retains a linked worktree owner when its path is inside a broad project", () => {
    const projects = [project("broad", "/tmp"), project("owner", "/projects/app")]
    const worktrees = new Map([["/projects/app", [worktree("/tmp/wt", "/projects/app")]]])
    expect(resolveProjectForSessionDirectory(projects, worktrees, "/tmp/wt/src")?.id).toBe("owner")
  })
})

describe("projectPathIsInsideRoot", () => {
  test("accepts a path inside the root", () => {
    expect(projectPathIsInsideRoot("/home/user/.config/app/plans/1-alpha.md", "/home/user/.config/app/plans")).toBe(
      true,
    )
  })

  test("rejects a sibling directory that shares the prefix", () => {
    expect(projectPathIsInsideRoot("/home/user/.config/app/plans-elsewhere/1-alpha.md", "/home/user/.config/app/plans")).toBe(
      false,
    )
  })

  // The written string starts with the root, so a prefix check alone accepted it while the filesystem
  // resolved it to a file anywhere above the root.
  test("rejects a path that climbs out of the root", () => {
    expect(
      projectPathIsInsideRoot("/home/user/.config/app/plans/../../../../../../etc/passwd", "/home/user/.config/app/plans"),
    ).toBe(false)
  })

  test("resolves segments the filesystem resolves", () => {
    expect(projectPathIsInsideRoot("/home/user/.config/app/plans/./nested/../1-alpha.md", "/home/user/.config/app/plans")).toBe(
      true,
    )
    expect(projectPathIsInsideRoot("/home/user/.config/app/plans/../../../etc/passwd", "/home/user/.config/app/plans")).toBe(
      false,
    )
  })

  test("keeps Windows drive paths case-insensitive and separate from other drives", () => {
    expect(projectPathIsInsideRoot("C:/Users/Alice/App/plans/1.md", "c:/Users/Alice/App/plans")).toBe(true)
    expect(projectPathIsInsideRoot("D:/Users/Alice/App/plans/1.md", "C:/Users/Alice/App/plans")).toBe(false)
  })
})

describe("root-preserving path containment", () => {
  test("retains case-insensitive UNC identity without accepting a POSIX lookalike", () => {
    expect(projectPathIsInsideRoot("\\\\SERVER\\Share\\plans\\one.md", "//server/share/plans")).toBe(true)
    expect(projectPathIsInsideRoot("/server/share/plans/one.md", "//server/share/plans")).toBe(false)
    expect(projectPathIsInsideRoot("//server/share/plans/one.md", "/server/share/plans")).toBe(false)
  })

  test("parent segments cannot consume a drive or UNC share root", () => {
    expect(projectPathIsInsideRoot("C:/../plans/one.md", "C:/plans")).toBe(true)
    expect(projectPathIsInsideRoot("//server/share/../plans/one.md", "//server/share/plans")).toBe(true)
    expect(projectPathIsInsideRoot("//server/share/plans/../one.md", "//server/share/plans")).toBe(false)
    expect(projectPathIsInsideRoot("//server/other/plans/one.md", "//server/share/plans")).toBe(false)
  })
})

describe("projectPathMatchesRoot", () => {
  test("matches Windows paths whose drive letters differ only by case", () => {
    expect(projectPathMatchesRoot("c:/Repo/src/a.ts", "C:/Repo")).toBe(true)
    expect(projectPathMatchesRoot("C:/Repo/src/a.ts", "c:/Repo")).toBe(true)
    expect(projectPathMatchesRoot("d:/Repo/src/a.ts", "C:/Repo")).toBe(false)
  })
})
