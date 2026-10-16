import { describe, expect, test } from "vitest"

import { collectUnverifiedPaths, filterStaleRecentPaths, findStaleRecentPaths } from "./mentionRecentFiles"

describe("filterStaleRecentPaths", () => {
  const files = [{ path: "/repo/a.ts" }, { path: "/repo/b.ts" }]

  test("keeps every file when nothing went stale", () => {
    expect(filterStaleRecentPaths(files, new Set())).toEqual(files)
  })

  test("drops only the paths that are gone", () => {
    expect(filterStaleRecentPaths(files, new Set(["/repo/a.ts"]))).toEqual([{ path: "/repo/b.ts" }])
  })

  test("does not alias the input array", () => {
    const kept = filterStaleRecentPaths(files, new Set())
    kept.push({ path: "/repo/c.ts" })
    expect(files).toHaveLength(2)
  })
})

describe("collectUnverifiedPaths", () => {
  test("keeps only paths not probed yet, ignoring empties", () => {
    expect(collectUnverifiedPaths(["/repo/a.ts", "", "/repo/b.ts"], new Set(["/repo/a.ts"]))).toEqual(["/repo/b.ts"])
  })
})

describe("findStaleRecentPaths", () => {
  test("reports a path whose entry is no longer a regular file", async () => {
    const stale = await findStaleRecentPaths(["/repo/dir"], async () => ({ isFile: false }))
    expect([...stale]).toEqual(["/repo/dir"])
  })

  test("reports a path whose stat fails because it is missing", async () => {
    const stale = await findStaleRecentPaths(["/repo/gone.ts"], async () => {
      throw new Error("ENOENT: no such file or directory")
    })
    expect([...stale]).toEqual(["/repo/gone.ts"])
  })

  test("keeps a path whose stat fails for another reason", async () => {
    const stale = await findStaleRecentPaths(["/repo/locked.ts"], async () => {
      throw new Error("EACCES: permission denied")
    })
    expect([...stale]).toEqual([])
  })

  test("keeps a path the runtime cannot describe", async () => {
    const stale = await findStaleRecentPaths(["/repo/a.ts"], async () => null)
    expect([...stale]).toEqual([])
  })

  test("probes nothing when the runtime has no statFile", async () => {
    const stale = await findStaleRecentPaths(["/repo/a.ts"], undefined)
    expect([...stale]).toEqual([])
  })
})
