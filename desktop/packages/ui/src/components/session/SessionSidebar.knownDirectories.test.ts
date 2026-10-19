import { describe, expect, test } from "vitest"
import type { Session } from "@defai-digital/ax-code-sdk/v2"
import type { WorktreeMetadata } from "@/types/worktree"
import { buildKnownSessionDirectories, isKnownActiveSessionDirectory } from "./SessionSidebar"

const session = (directory: string): Session =>
  ({ id: directory, directory, title: directory, time: { created: 1, updated: 1 } }) as unknown as Session

const worktree = (path: string): WorktreeMetadata => ({ path }) as unknown as WorktreeMetadata

describe("SessionSidebar known session directories", () => {
  test("keeps a session started in a subdirectory of a project", () => {
    // Ownership elsewhere in the app is the nearest containing project, so the
    // sidebar filter must not drop sessions that live below a project root.
    const knownDirectories = buildKnownSessionDirectories([{ path: "/repo" }], new Map())

    expect(isKnownActiveSessionDirectory(session("/repo/sub"), knownDirectories)).toBe(true)
    expect(isKnownActiveSessionDirectory(session("/repo"), knownDirectories)).toBe(true)
  })

  test("does not treat a sibling whose name starts with the root as inside it", () => {
    const knownDirectories = buildKnownSessionDirectories([{ path: "/repo" }], new Map())

    expect(isKnownActiveSessionDirectory(session("/repo2"), knownDirectories)).toBe(false)
    expect(isKnownActiveSessionDirectory(session("/repo2/sub"), knownDirectories)).toBe(false)
  })

  test("matches worktree paths by prefix too", () => {
    const knownDirectories = buildKnownSessionDirectories(
      [{ path: "/repo" }],
      new Map([["/repo", [worktree("/worktrees/feature")]]]),
    )

    expect(isKnownActiveSessionDirectory(session("/worktrees/feature/src"), knownDirectories)).toBe(true)
    expect(isKnownActiveSessionDirectory(session("/worktrees/feature-2"), knownDirectories)).toBe(false)
  })
})
