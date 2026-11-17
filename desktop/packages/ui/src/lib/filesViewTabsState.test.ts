import { describe, expect, test } from "vitest"

import { clampFilesViewRoots, sanitizeFilesViewRoots } from "./filesViewTabsState"
import type { FilesViewRootTabsState } from "./filesViewTabsState"

const state = (root: string, touchedAt = 1): FilesViewRootTabsState => ({
  openPaths: [`${root}/file.ts`],
  selectedPath: `${root}/file.ts`,
  expandedPaths: [],
  touchedAt,
})

describe("Files tab restore boundary", () => {
  test.each([null, 42, "bad", [], [state("/repo")]])("rejects a malformed root container: %j", (value) => {
    expect(sanitizeFilesViewRoots(value)).toEqual({})
  })

  test("merges legacy normalized roots while preserving literal filenames and selection fallback", () => {
    const roots = sanitizeFilesViewRoots({
      "/repo/": { openPaths: ["/repo/a.ts ", "/repo/a.ts ", "/other/file.ts"], touchedAt: 3 },
      "/repo": { openPaths: ["/repo/b.ts"], expandedPaths: ["/repo/src", "/outside"], touchedAt: 5 },
      "/bad": [],
    })
    expect(roots).toEqual({
      "/repo": {
        openPaths: ["/repo/a.ts ", "/repo/b.ts"],
        selectedPath: "/repo/a.ts ",
        expandedPaths: ["/repo/src"],
        touchedAt: 5,
      },
    })
  })

  test("handles inherited-property-shaped keys without treating prototypes as prior tab state", () => {
    const roots = sanitizeFilesViewRoots(JSON.parse('{"__proto__":{"openPaths":["__proto__/file.ts"]}}'))
    expect(Object.keys(roots)).toEqual(["__proto__"])
    expect(roots["__proto__"].openPaths).toEqual(["__proto__/file.ts"])
    expect(Object.getPrototypeOf(roots)).toBe(Object.prototype)
  })

  test("deduplicates Windows and UNC case variants with the same identity as live operations", () => {
    const roots = sanitizeFilesViewRoots({
      "C:\\repo": { openPaths: ["C:\\repo\\file.ts", "c:/REPO/FILE.ts"] },
      "//host/share": { openPaths: ["//host/share/file.ts", "//HOST/SHARE/FILE.TS"] },
    })
    expect(roots["C:/repo"].openPaths).toEqual(["C:/repo/file.ts"])
    expect(roots["//host/share"].openPaths).toEqual(["//host/share/file.ts"])
  })

  test("bounds restored roots by recency and pins an acted-on root even when timestamps tie", () => {
    const roots = Object.fromEntries(
      Array.from({ length: 21 }, (_, index) => [`/repo-${index}`, state(`/repo-${index}`, index)]),
    )
    const restored = sanitizeFilesViewRoots(roots)
    expect(Object.keys(restored)).toHaveLength(20)
    expect(restored["/repo-0"]).toBeUndefined()
    const tied = Object.fromEntries(Object.keys(roots).map((root) => [root, state(root)]))
    expect(clampFilesViewRoots(tied, "/repo-20")["/repo-20"]).toEqual(state("/repo-20"))
  })
})
