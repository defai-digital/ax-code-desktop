import { describe, expect, test } from "vitest"

import { sessionChangesStillUncommitted } from "./changeAttribution"

const tree = (...paths: string[]) => ({ isClean: paths.length === 0, files: paths.map((path) => ({ path })) })
const named = (...files: string[]) => ({ files: files.length, diffs: files.map((file) => ({ file, additions: 3 })) })

describe("sessionChangesStillUncommitted", () => {
  test("a clean tree, a missing status or a session with no reported changes never counts", () => {
    expect(sessionChangesStillUncommitted(named("a.ts"), tree())).toBe(false)
    expect(sessionChangesStillUncommitted(named("a.ts"), null)).toBe(false)
    expect(sessionChangesStillUncommitted(undefined, tree("a.ts"))).toBe(false)
    expect(sessionChangesStillUncommitted({ additions: 0, deletions: 0 }, tree("a.ts"))).toBe(false)
  })

  test("named files count only while one of them is still dirty", () => {
    expect(sessionChangesStillUncommitted(named("src/a.ts", "src/b.ts"), tree("src/b.ts"))).toBe(true)
    // The user's own edit keeps the tree dirty, but every file this session changed was committed.
    expect(sessionChangesStillUncommitted(named("src/a.ts"), tree("notes/todo.md"))).toBe(false)
  })

  test("path spelling differences do not hide a match", () => {
    expect(sessionChangesStillUncommitted(named("./src/a.ts"), tree("src/a.ts"))).toBe(true)
    expect(sessionChangesStillUncommitted(named("src\\a.ts"), tree("src/a.ts"))).toBe(true)
    expect(sessionChangesStillUncommitted(named("/work/app/src/a.ts"), { ...tree("src/a.ts"), worktreeRoot: "/work/app" })).toBe(true)
  })

  test("a file whose name merely ends the same way is not a match", () => {
    expect(sessionChangesStillUncommitted(named("src/data.ts"), tree("a.ts"))).toBe(false)
    expect(sessionChangesStillUncommitted(named("src/ba.ts"), tree("a.ts"))).toBe(false)
  })

  test("counts without file names fall back to a reported change in a dirty tree", () => {
    expect(sessionChangesStillUncommitted({ additions: 4, deletions: 1, files: 2 }, tree("anything.ts"))).toBe(true)
  })
})

test("relative paths cannot match by suffix and absolute paths use the actual worktree root", () => {
  expect(sessionChangesStillUncommitted(named("src/a.ts"), tree("a.ts"))).toBe(false)
  const status = { ...tree("a.ts"), worktreeRoot: "/work/app" }
  expect(sessionChangesStillUncommitted(named("/work/app/src/a.ts"), status)).toBe(false)
  expect(sessionChangesStillUncommitted(named("/work/app/a.ts"), status)).toBe(true)
  expect(sessionChangesStillUncommitted(named("/other/app/a.ts"), status)).toBe(false)
  expect(sessionChangesStillUncommitted(named("pkg/src/a.ts"), { ...tree("pkg/src/a.ts"), worktreeRoot: "/work/app" })).toBe(true)
})
