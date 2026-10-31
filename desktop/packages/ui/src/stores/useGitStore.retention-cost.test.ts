import { beforeEach, describe, expect, test, vi } from "vitest"
import type { GitStatus } from "@/lib/api/types"
import { GIT_REPO_SUMMARY_LIMIT, useGitStore } from "./useGitStore"

const { priced } = vi.hoisted(() => ({ priced: vi.fn<(value: unknown) => void>() }))

vi.mock("@/lib/retainedPayloadSize", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/retainedPayloadSize")>()
  return {
    retainedPayloadSize: (value: unknown) => {
      priced(value)
      return actual.retainedPayloadSize(value)
    },
  }
})

const status = (branch: string): GitStatus => ({
  current: branch,
  tracking: null,
  ahead: 0,
  behind: 0,
  files: [],
  isClean: true,
})

// Writes a resolved repository entry for `directory` through the retention wrapper.
const publishStatus = (directory: string, branch: string) => {
  useGitStore.getState().setActiveDirectory(directory)
  const entry = useGitStore.getState().directories.get(directory)
  if (!entry) throw new Error(`missing entry for ${directory}`)
  useGitStore.setState({
    directories: new Map(useGitStore.getState().directories).set(directory, {
      ...entry,
      isGitRepo: true,
      status: status(branch),
    }),
  })
  // Any action write runs the wrapper over the current directories.
  useGitStore.getState().removeDirectory("/missing")
}

describe("Git store retention cost", () => {
  beforeEach(() => {
    useGitStore.setState({ directories: new Map(), repoSummaries: new Map(), activeDirectory: null })
    priced.mockClear()
  })

  test("a write that replaces one directory entry re-prices only that entry", () => {
    useGitStore.getState().setActiveDirectory("/a")
    useGitStore.getState().setActiveDirectory("/b")
    priced.mockClear()

    useGitStore.getState().setLogMaxCount("/a", 50)

    const directories = useGitStore.getState().directories
    expect(directories.size).toBe(2)
    // The replaced `/a` entry is priced once (its diff cache is empty); the untouched `/b` entry is not.
    expect(priced.mock.calls.map(([value]) => value)).toEqual([directories.get("/a")])
  })

  test("a write that replaces no entry prices nothing", () => {
    useGitStore.getState().setActiveDirectory("/a")
    useGitStore.getState().setActiveDirectory("/b")
    priced.mockClear()

    // Runs the retention wrapper with both entries unchanged.
    useGitStore.getState().removeDirectory("/missing")

    expect(useGitStore.getState().directories.size).toBe(2)
    expect(priced).not.toHaveBeenCalled()
  })

  test("a changed summary moves to the back so the cap evicts the least recently updated first", () => {
    const summaries = new Map<string, { isGitRepo: boolean; branch: string | null }>()
    for (let index = 0; index < GIT_REPO_SUMMARY_LIMIT; index += 1) {
      summaries.set(`/wt/${index}`, { isGitRepo: true, branch: "feature" })
    }
    useGitStore.setState({ repoSummaries: summaries })
    // `/wt/0` holds the oldest summary; a status read moves its branch to "main".
    publishStatus("/wt/0", "main")
    expect([...useGitStore.getState().repoSummaries.keys()].at(-1)).toBe("/wt/0")
    // Visiting other projects pushes `/wt/0` out of the working set, so only its summary position protects it.
    for (let index = 0; index < 12; index += 1) useGitStore.getState().setActiveDirectory(`/visited/${index}`)
    expect(useGitStore.getState().directories.has("/wt/0")).toBe(false)

    publishStatus("/new", "main")

    const after = useGitStore.getState().repoSummaries
    expect(after.size).toBe(GIT_REPO_SUMMARY_LIMIT)
    expect(after.has("/new")).toBe(true)
    expect(after.has("/wt/0")).toBe(true)
    expect(after.has("/wt/1")).toBe(false)
    expect(after.has("/wt/2")).toBe(true)
  })

  test("removing several directories publishes once", () => {
    for (const directory of ["/repo", "/repo/.worktrees/a", "/repo/.worktrees/b", "/other"]) {
      useGitStore.getState().setActiveDirectory(directory)
    }
    useGitStore.setState({
      repoSummaries: new Map([
        ["/repo", { isGitRepo: true, branch: "main" }],
        ["/repo/.worktrees/a", { isGitRepo: true, branch: "a" }],
        ["/repo/.worktrees/b", { isGitRepo: true, branch: "b" }],
        ["/other", { isGitRepo: true, branch: "main" }],
      ]),
    })
    const listener = vi.fn()
    const unsubscribe = useGitStore.subscribe(listener)

    useGitStore.getState().removeDirectoriesMatching((directory) => directory.startsWith("/repo"))
    unsubscribe()

    expect(listener).toHaveBeenCalledTimes(1)
    const state = useGitStore.getState()
    expect([...state.directories.keys()]).toEqual(["/other"])
    expect([...state.repoSummaries.keys()]).toEqual(["/other"])
    expect(state.activeDirectory).toBe("/other")
    expect(state.getDirectoryState("/repo")).toBeNull()
  })

  test("removing the active directory through a batch clears the selection", () => {
    useGitStore.getState().setActiveDirectory("/other")
    useGitStore.getState().setActiveDirectory("/repo")

    useGitStore.getState().removeDirectoriesMatching((directory) => directory === "/repo")

    expect(useGitStore.getState().activeDirectory).toBeNull()
    expect(useGitStore.getState().directories.has("/other")).toBe(true)
  })
})
