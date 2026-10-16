import { describe, expect, it } from "vitest"

import { createWorktreeBootstrapGenerations } from "./worktree-bootstrap-generation.js"

describe("worktree bootstrap generations", () => {
  it("keeps the run that started last as the owner", () => {
    const generations = createWorktreeBootstrapGenerations()

    const first = generations.start("/repo/.worktrees/a")
    expect(generations.isCurrent("/repo/.worktrees/a", first)).toBe(true)

    // A second run for the same directory (the worktree was re-created) takes it over.
    const second = generations.start("/repo/.worktrees/a")
    expect(generations.isCurrent("/repo/.worktrees/a", first)).toBe(false)
    expect(generations.isCurrent("/repo/.worktrees/a", second)).toBe(true)
  })

  it("retires the run in flight when the worktree is removed", () => {
    const generations = createWorktreeBootstrapGenerations()

    const run = generations.start("/repo/.worktrees/a")
    generations.invalidate("/repo/.worktrees/a")

    expect(generations.isCurrent("/repo/.worktrees/a", run)).toBe(false)
  })

  it("tracks directories independently", () => {
    const generations = createWorktreeBootstrapGenerations()

    const a = generations.start("/repo/.worktrees/a")
    const b = generations.start("/repo/.worktrees/b")
    generations.invalidate("/repo/.worktrees/a")

    expect(generations.isCurrent("/repo/.worktrees/a", a)).toBe(false)
    expect(generations.isCurrent("/repo/.worktrees/b", b)).toBe(true)
  })
})
