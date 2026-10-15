import { describe, expect, test } from "vitest"
import type { ProjectEntry } from "@/lib/api/types"
import type { WorktreeMetadata } from "@/types/worktree"

import { resolveProjectForDirectory, resolveProjectForSessionDirectory } from "./projectResolution"

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
