import { beforeEach, describe, expect, test } from "vitest"
import { useFilesViewTabsStore } from "./useFilesViewTabsStore"

describe("useFilesViewTabsStore", () => {
  beforeEach(() => {
    useFilesViewTabsStore.setState({ byRoot: {} })
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
