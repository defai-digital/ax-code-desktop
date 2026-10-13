import { describe, expect, test } from "vitest"
import type { WorktreeMetadata } from "@/types/worktree"
import { pruneExpiredWorktreeListEntries } from "./worktreeManager"

const entry = (at: number) => ({ value: [] as WorktreeMetadata[], at })

describe("pruneExpiredWorktreeListEntries", () => {
  test("drops entries whose TTL has passed and keeps fresh ones", () => {
    const cache = new Map<string, { value: WorktreeMetadata[]; at: number }>()
    cache.set("/repo/old", entry(0))
    cache.set("/repo/fresh", entry(29_000))

    pruneExpiredWorktreeListEntries(cache, 30_000)

    expect([...cache.keys()]).toEqual(["/repo/fresh"])
  })

  test("an entry expiring exactly at the cutoff counts as expired, matching the cache read", () => {
    const cache = new Map<string, { value: WorktreeMetadata[]; at: number }>()
    cache.set("/repo/a", entry(0))

    pruneExpiredWorktreeListEntries(cache, 30_000)

    expect(cache.size).toBe(0)
  })
})
