import type { Session } from "@defai-digital/ax-code-sdk/v2"
import { describe, expect, test } from "vitest"
import { isSessionInPrefetchDirectory } from "./useSessionPrefetch"

const session = (directory: string): Session =>
  ({
    id: `ses_${directory}`,
    slug: "session",
    projectID: "project",
    directory,
    title: "Session",
    version: "1",
    time: { created: 1, updated: 2 },
  }) as Session

describe("isSessionInPrefetchDirectory", () => {
  test("accepts a session in the active directory", () => {
    expect(isSessionInPrefetchDirectory(session("/repo/a"), "/repo/a")).toBe(true)
    expect(isSessionInPrefetchDirectory(session("/repo/a/"), "/repo/a")).toBe(true)
  })

  test("rejects a session from another project", () => {
    expect(isSessionInPrefetchDirectory(session("/repo/b"), "/repo/a")).toBe(false)
  })

  test("rejects a worktree session while its project root is active", () => {
    // Opening the worktree changes the directory first; prefetching through the
    // root would ask the runtime for a transcript in the wrong directory.
    expect(isSessionInPrefetchDirectory(session("/repo/a/.worktrees/feature"), "/repo/a")).toBe(false)
  })

  test("rejects every session while no directory is active", () => {
    expect(isSessionInPrefetchDirectory(session("/repo/a"), null)).toBe(false)
    expect(isSessionInPrefetchDirectory(session("/repo/a"), "")).toBe(false)
  })
})
