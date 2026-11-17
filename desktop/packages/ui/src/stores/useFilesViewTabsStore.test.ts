import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { useFilesViewTabsStore } from "./useFilesViewTabsStore"

describe("useFilesViewTabsStore", () => {
  beforeEach(() => {
    useFilesViewTabsStore.setState({ byRoot: {} })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test("keeps the root being opened when root timestamps tie", () => {
    vi.spyOn(Date, "now").mockReturnValue(123)
    for (let index = 0; index < 21; index++) {
      const root = `/repo-${index}`
      useFilesViewTabsStore.getState().setSelectedPath(root, `${root}/file.ts`)
    }
    const roots = useFilesViewTabsStore.getState().byRoot
    expect(Object.keys(roots)).toHaveLength(20)
    expect(roots["/repo-20"]?.selectedPath).toBe("/repo-20/file.ts")
  })

  test("validates current-version hydration without restoring action-shaped payloads", async () => {
    const persist = useFilesViewTabsStore.persist
    const originalStorage = persist.getOptions().storage
    const action = useFilesViewTabsStore.getState().setSelectedPath
    persist.setOptions({
      storage: {
        getItem: () => ({
          version: 2,
          state: {
            byRoot: {
              "/repo": { openPaths: ["/repo/a.ts", "/other/b.ts", 42], selectedPath: "/other/b.ts", expandedPaths: 42 },
            },
            setSelectedPath: "stale value",
          },
        }),
        setItem: () => {},
        removeItem: () => {},
      },
    })
    try {
      await persist.rehydrate()
      expect(useFilesViewTabsStore.getState().setSelectedPath).toBe(action)
      expect(useFilesViewTabsStore.getState().byRoot["/repo"]).toMatchObject({
        openPaths: ["/repo/a.ts"],
        selectedPath: "/repo/a.ts",
        expandedPaths: [],
      })
    } finally {
      persist.setOptions({ storage: originalStorage })
      useFilesViewTabsStore.setState({ setSelectedPath: action })
    }
  })

  test("uses the same UNC identity for containment, close and stale-path removal", () => {
    const root = "//SERVER/Share"
    const store = useFilesViewTabsStore.getState()
    store.addOpenPath(root, "//server/share/first.ts")
    store.setSelectedPath(root, "//server/share/second.ts")
    store.removeUnselectedOpenPath(root, "//SERVER/SHARE/FIRST.TS")
    expect(useFilesViewTabsStore.getState().byRoot[root]?.openPaths).toEqual(["//server/share/second.ts"])
    store.removeOpenPath(root, "//SERVER/SHARE/SECOND.TS")
    expect(useFilesViewTabsStore.getState().byRoot[root]?.selectedPath).toBeNull()
  })

  test("does not publish unchanged add, select, expand or remove operations", () => {
    const root = "/repo"
    const store = useFilesViewTabsStore.getState()
    store.setSelectedPath(root, "/repo/a.ts")
    store.expandPath(root, "/repo/src")
    const listener = vi.fn()
    const unsubscribe = useFilesViewTabsStore.subscribe(listener)
    try {
      store.addOpenPath(root, "/repo/a.ts")
      store.setSelectedPath(root, "/repo/a.ts")
      store.expandPaths(root, ["/repo/src", "/repo/src"])
      store.removeOpenPath(root, "/repo/missing.ts")
      store.removeOpenPathsByPrefix(root, "/repo/other")
      store.ensureSelectedPath(root)
      expect(listener).not.toHaveBeenCalled()
    } finally {
      unsubscribe()
    }
  })

  test("toggles expansion without duplicates and removes only the requested subtree", () => {
    const root = "/repo"
    const store = useFilesViewTabsStore.getState()
    store.expandPaths(root, ["/repo/src", "/repo/src"])
    expect(useFilesViewTabsStore.getState().byRoot[root]?.expandedPaths).toEqual(["/repo/src"])
    store.toggleExpandedPath(root, "/repo/src")
    expect(useFilesViewTabsStore.getState().byRoot[root]?.expandedPaths).toEqual([])
    store.toggleExpandedPath(root, "/repo/src")
    store.addOpenPath(root, "/repo/src/a.ts")
    store.setSelectedPath(root, "/repo/src2/b.ts")
    store.removeOpenPathsByPrefix(root, "/repo/src")
    expect(useFilesViewTabsStore.getState().byRoot[root]?.openPaths).toEqual(["/repo/src2/b.ts"])
    expect(useFilesViewTabsStore.getState().byRoot[root]?.selectedPath).toBe("/repo/src2/b.ts")
    store.setSelectedPath(root, null)
    store.ensureSelectedPath(root)
    expect(useFilesViewTabsStore.getState().byRoot[root]?.selectedPath).toBe("/repo/src2/b.ts")
  })

  test("keeps migration and merge validation consistent and bounded", async () => {
    const payload = {
      byRoot: Object.fromEntries(
        Array.from({ length: 25 }, (_, index) => [
          `/repo-${index}`,
          { openPaths: [`/repo-${index}/a.ts`], selectedPath: null, expandedPaths: [], touchedAt: index },
        ]),
      ),
    }
    const options = useFilesViewTabsStore.persist.getOptions()
    const migrated = await options.migrate?.(payload, 1)
    const merged = options.merge?.(payload, useFilesViewTabsStore.getState())
    expect(merged?.byRoot).toEqual((migrated as { byRoot: unknown }).byRoot)
    expect(Object.keys(merged?.byRoot ?? {})).toHaveLength(20)
    expect(merged?.byRoot["/repo-0"]).toBeUndefined()
  })

  test("restores a selected file into its open list so subtree removal clears it", () => {
    const current = useFilesViewTabsStore.getState()
    const restored = useFilesViewTabsStore.persist.getOptions().merge?.(
      {
        byRoot: {
          "/repo": {
            openPaths: ["/repo/keep.ts"],
            selectedPath: "/repo/src/stale.ts",
            expandedPaths: [],
            touchedAt: 1,
          },
        },
      },
      current,
    )
    expect(restored?.byRoot["/repo"]?.openPaths).toEqual(["/repo/keep.ts", "/repo/src/stale.ts"])
    if (!restored) throw new Error("Missing persistence merge")
    useFilesViewTabsStore.setState(restored)
    useFilesViewTabsStore.getState().removeOpenPathsByPrefix("/repo", "/repo/src")
    expect(useFilesViewTabsStore.getState().byRoot["/repo"]?.selectedPath).toBe("/repo/keep.ts")
  })

  test("preserves an explicit empty-root reset and the latest selected path spelling", () => {
    const root = "//host/share"
    const store = useFilesViewTabsStore.getState()
    store.setSelectedPath(root, null)
    expect(useFilesViewTabsStore.getState().byRoot[root]).toMatchObject({ openPaths: [], selectedPath: null })
    store.setSelectedPath(root, "//host/share/file.ts")
    store.setSelectedPath(root, "//HOST/SHARE/FILE.ts")
    expect(useFilesViewTabsStore.getState().byRoot[root]).toMatchObject({
      openPaths: ["//host/share/file.ts"],
      selectedPath: "//HOST/SHARE/FILE.ts",
    })
  })

  test("keeps live tabs when rehydration has no stored snapshot", () => {
    useFilesViewTabsStore.getState().setSelectedPath("/repo", "/repo/live.ts")
    const current = useFilesViewTabsStore.getState()
    const merged = useFilesViewTabsStore.persist.getOptions().merge?.(undefined, current)
    expect(merged).toBe(current)
  })

  test("keeps literal whitespace through file selection, close and stale-path removal", () => {
    const root = "/repo"
    const plain = "/repo/file.txt"
    const spaced = "/repo/file.txt "
    const store = useFilesViewTabsStore.getState()
    store.addOpenPath(root, plain)
    store.addOpenPath(root, spaced)
    store.setSelectedPath(root, spaced)
    expect(useFilesViewTabsStore.getState().byRoot[root]?.openPaths).toEqual([plain, spaced])
    expect(useFilesViewTabsStore.getState().byRoot[root]?.selectedPath).toBe(spaced)
    store.removeUnselectedOpenPath(root, plain)
    expect(useFilesViewTabsStore.getState().byRoot[root]?.openPaths).toEqual([spaced])
    store.removeOpenPath(root, spaced)
    expect(useFilesViewTabsStore.getState().byRoot[root]?.openPaths).toEqual([])
  })

  test("ignores runtime paths outside the requested root", () => {
    const root = "/repo"
    const store = useFilesViewTabsStore.getState()

    store.addOpenPath(root, "/other/file.ts")
    store.setSelectedPath(root, "/other/file.ts")
    store.expandPath(root, "/other")
    store.toggleExpandedPath(root, "/other")

    expect(useFilesViewTabsStore.getState().byRoot).toEqual({})
  })

  test("filters expanded path batches to the requested root", () => {
    const root = "/repo"

    useFilesViewTabsStore.getState().expandPaths(root, ["/repo/src", "/other/src"])

    expect(useFilesViewTabsStore.getState().byRoot[root]?.expandedPaths).toEqual(["/repo/src"])
  })

  test("drops an unselected stale path but keeps a selected one", () => {
    const root = "/repo"
    const store = useFilesViewTabsStore.getState()

    store.addOpenPath(root, "/repo/gone.ts")
    store.addOpenPath(root, "/repo/kept.ts")
    store.setSelectedPath(root, "/repo/kept.ts")
    store.removeUnselectedOpenPath(root, "/repo/gone.ts")

    const rootState = useFilesViewTabsStore.getState().byRoot[root]
    expect(rootState?.openPaths).toEqual(["/repo/kept.ts"])
    expect(rootState?.selectedPath).toBe("/repo/kept.ts")

    store.removeUnselectedOpenPath(root, "/repo/kept.ts")
    expect(useFilesViewTabsStore.getState().byRoot[root]?.openPaths).toEqual(["/repo/kept.ts"])
  })

  test("keeps the first open path when nothing is selected and it is the stale one", () => {
    const root = "/repo"
    const store = useFilesViewTabsStore.getState()

    store.addOpenPath(root, "/repo/first.ts")
    store.addOpenPath(root, "/repo/second.ts")
    store.setSelectedPath(root, null)
    store.removeUnselectedOpenPath(root, "/repo/first.ts")

    const rootState = useFilesViewTabsStore.getState().byRoot[root]
    expect(rootState?.openPaths).toEqual(["/repo/first.ts", "/repo/second.ts"])
    expect(rootState?.selectedPath).toBeNull()
  })
})
