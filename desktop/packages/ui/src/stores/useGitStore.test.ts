import React, { act } from "react"
import { createRoot } from "react-dom/client"
import { beforeEach, describe, expect, test } from "vitest"
import type { GitStatus } from "@/lib/api/types"
import { useGitRepoStatusMap, useGitStore, type GitStoreAPI } from "./useGitStore"

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

type GitStoreDirectoryState = NonNullable<ReturnType<ReturnType<typeof useGitStore.getState>["getDirectoryState"]>>

const createDeferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const createStatus = (diffStats?: GitStatus["diffStats"], files: GitStatus["files"] = []): GitStatus => ({
  current: "main",
  tracking: null,
  ahead: 0,
  behind: 0,
  files,
  isClean: files.length === 0,
  diffStats,
})

const createDirectoryState = (status: GitStatus): GitStoreDirectoryState => ({
  isGitRepo: true,
  status,
  branches: null,
  log: null,
  identity: null,
  diffCache: new Map(),
  indexRevision: 0,
  lastRepoCheckAt: 0,
  lastStatusFetch: 0,
  lastStatusChange: 0,
  lastLogFetch: 0,
  lastBranchesFetch: 0,
  lastIdentityFetch: 0,
  logMaxCount: 25,
  isLoadingStatus: false,
  isLoadingLog: false,
  isLoadingBranches: false,
  isLoadingIdentity: false,
})

const setDirectoryStatus = (status: GitStatus) => {
  useGitStore.setState({
    directories: new Map([["/repo", createDirectoryState(status)]]),
    activeDirectory: "/repo",
  })
}

const createGitApi = (getGitStatus: GitStoreAPI["getGitStatus"]): GitStoreAPI => ({
  checkIsGitRepository: async () => true,
  getGitStatus,
  getGitBranches: async () => ({ all: [], current: "main", branches: {} }),
  getGitLog: async () => ({ all: [], latest: null, total: 0 }),
  getCurrentGitIdentity: async () => null,
  getGitFileDiff: async (_directory, options) => ({ original: "", modified: "", path: options.path }),
})

describe("useGitStore", () => {
  beforeEach(() => {
    useGitStore.setState({
      directories: new Map(),
      activeDirectory: null,
    })
  })

  test("publishes a HEAD move even when paths, blobs and status letters are unchanged", async () => {
    const before = { ...createStatus(), headOid: "a".repeat(40) }
    setDirectoryStatus(before)
    const after = { ...before, headOid: "b".repeat(40) }
    const changed = await useGitStore.getState().fetchStatus("/repo", createGitApi(async () => after), { silent: true })
    expect(useGitStore.getState().getDirectoryState("/repo")?.status?.headOid).toBe(after.headOid)
    expect(changed).toBe(true)
  })

  test("does not reuse an in-flight light status request for full status", async () => {
    const requests: Deferred<GitStatus>[] = []
    const statusCalls: Array<{ directory: string; options?: { mode?: "light" } }> = []
    const git = createGitApi((directory, options) => {
      statusCalls.push({ directory, options })
      const request = createDeferred<GitStatus>()
      requests.push(request)
      return request.promise
    })

    const lightPromise = useGitStore.getState().fetchStatus("/repo", git, { mode: "light", silent: true })
    const fullPromise = useGitStore.getState().fetchStatus("/repo", git, { silent: true })
    await Promise.resolve()

    expect(statusCalls).toEqual([
      { directory: "/repo", options: { mode: "light" } },
      { directory: "/repo", options: undefined },
    ])

    requests[0].resolve(createStatus())
    requests[1].resolve(createStatus({ staged: {}, working: { "src/index.ts": { insertions: 1, deletions: 0 } } }))
    await Promise.all([lightPromise, fullPromise])
  })

  test("reuses an in-flight full status request for light status", async () => {
    const requests: Deferred<GitStatus>[] = []
    const statusCalls: Array<{ directory: string; options?: { mode?: "light" } }> = []
    const git = createGitApi((directory, options) => {
      statusCalls.push({ directory, options })
      const request = createDeferred<GitStatus>()
      requests.push(request)
      return request.promise
    })

    const fullPromise = useGitStore.getState().fetchStatus("/repo", git, { silent: true })
    const lightPromise = useGitStore.getState().fetchStatus("/repo", git, { mode: "light", silent: true })
    await Promise.resolve()

    expect(statusCalls).toEqual([{ directory: "/repo", options: undefined }])

    requests[0].resolve(createStatus({ staged: {}, working: { "src/index.ts": { insertions: 1, deletions: 0 } } }))
    const [fullResult, lightResult] = await Promise.all([fullPromise, lightPromise])
    expect(lightResult).toBe(fullResult)
  })

  test("does not let an older light status response overwrite a newer full status", async () => {
    const requests: Deferred<GitStatus>[] = []
    const git = createGitApi(() => {
      const request = createDeferred<GitStatus>()
      requests.push(request)
      return request.promise
    })

    const lightPromise = useGitStore.getState().fetchStatus("/repo", git, { mode: "light", silent: true })
    const fullPromise = useGitStore.getState().fetchStatus("/repo", git, { silent: true })
    await Promise.resolve()

    requests[1].resolve(
      createStatus({ staged: {}, working: { "new.ts": { insertions: 2, deletions: 0 } } }, [{ path: "new.ts", index: " ", working_dir: "M" }]),
    )
    await fullPromise

    requests[0].resolve(createStatus(undefined, [{ path: "stale.ts", index: " ", working_dir: "M" }]))
    await lightPromise

    expect(useGitStore.getState().getDirectoryState("/repo")?.status?.files).toEqual([
      { path: "new.ts", index: " ", working_dir: "M" },
    ])
    expect(useGitStore.getState().getDirectoryState("/repo")?.status?.diffStats).toEqual({
      staged: {},
      working: { "new.ts": { insertions: 2, deletions: 0 } },
    })
  })

  test("does not let an older log response overwrite a newer one", async () => {
    type LogResponse = Awaited<ReturnType<GitStoreAPI["getGitLog"]>>
    const requests: Deferred<LogResponse>[] = []
    const git: GitStoreAPI = {
      ...createGitApi(async () => createStatus()),
      getGitLog: async () => {
        const request = createDeferred<LogResponse>()
        requests.push(request)
        return request.promise
      },
    }

    const older = useGitStore.getState().fetchLog("/repo", git, 25)
    const newer = useGitStore.getState().fetchLog("/repo", git, 25)
    await Promise.resolve()

    requests[1].resolve({ all: [{ hash: "new-commit" }], latest: { hash: "new-commit" }, total: 1 } as LogResponse)
    await newer
    requests[0].resolve({ all: [{ hash: "old-commit" }], latest: { hash: "old-commit" }, total: 1 } as LogResponse)
    await older

    expect(useGitStore.getState().getDirectoryState("/repo")?.log?.all).toEqual([{ hash: "new-commit" }])
  })

  test("optimistically stages modified files and preserves untouched file references", () => {
    const target = { path: "src/index.ts", index: " ", working_dir: "M" }
    const untouched = { path: "README.md", index: " ", working_dir: "M" }
    const initialStatus = createStatus(undefined, [target, untouched])
    setDirectoryStatus(initialStatus)

    const previousStatus = useGitStore.getState().moveStatusPathsOptimistically("/repo", ["src/index.ts"], "stage")
    const status = useGitStore.getState().getDirectoryState("/repo")?.status
    const state = useGitStore.getState().getDirectoryState("/repo")

    expect(previousStatus).toBe(initialStatus)
    expect(status?.files).toEqual([{ path: "src/index.ts", index: "M", working_dir: " " }, untouched])
    expect(status?.files[1]).toBe(untouched)
    expect(state?.indexRevision).toBe(1)
  })

  test("optimistically stages untracked files as added files", () => {
    setDirectoryStatus(createStatus(undefined, [{ path: "new-file.ts", index: "?", working_dir: "?" }]))

    useGitStore.getState().moveStatusPathsOptimistically("/repo", ["new-file.ts"], "stage")
    const status = useGitStore.getState().getDirectoryState("/repo")?.status

    expect(status?.files).toEqual([{ path: "new-file.ts", index: "A", working_dir: " " }])
  })

  test("optimistically unstages staged files", () => {
    setDirectoryStatus(createStatus(undefined, [{ path: "src/index.ts", index: "M", working_dir: " " }]))

    useGitStore.getState().moveStatusPathsOptimistically("/repo", ["src/index.ts"], "unstage")
    const status = useGitStore.getState().getDirectoryState("/repo")?.status

    expect(status?.files).toEqual([{ path: "src/index.ts", index: " ", working_dir: "M" }])
  })

  test("optimistically unstages staged added files back to untracked files", () => {
    setDirectoryStatus(createStatus(undefined, [{ path: "new-file.ts", index: "A", working_dir: " " }]))

    useGitStore.getState().moveStatusPathsOptimistically("/repo", ["new-file.ts"], "unstage")
    const status = useGitStore.getState().getDirectoryState("/repo")?.status

    expect(status?.files).toEqual([{ path: "new-file.ts", index: " ", working_dir: "?" }])
  })

  test("keeps conflicted files unchanged during optimistic moves", () => {
    const conflicted = { path: "conflict.ts", index: "U", working_dir: "U" }
    setDirectoryStatus(createStatus(undefined, [conflicted]))

    useGitStore.getState().moveStatusPathsOptimistically("/repo", ["conflict.ts"], "stage")
    const status = useGitStore.getState().getDirectoryState("/repo")?.status

    expect(status?.files).toEqual([conflicted])
    expect(status?.files[0]).toBe(conflicted)
  })

  test("preserves diff stats during optimistic moves", () => {
    const diffStats = { staged: {}, working: { "src/index.ts": { insertions: 2, deletions: 1 } } }
    setDirectoryStatus(createStatus(diffStats, [{ path: "src/index.ts", index: " ", working_dir: "M" }]))

    useGitStore.getState().moveStatusPathsOptimistically("/repo", ["src/index.ts"], "stage")
    const status = useGitStore.getState().getDirectoryState("/repo")?.status

    expect(status?.diffStats).toBe(diffStats)
  })

  test("does nothing when optimistic move has no matching path", () => {
    const initialStatus = createStatus(undefined, [{ path: "src/index.ts", index: " ", working_dir: "M" }])
    setDirectoryStatus(initialStatus)

    const previousStatus = useGitStore.getState().moveStatusPathsOptimistically("/repo", ["missing.ts"], "stage")

    expect(previousStatus).toBe(initialStatus)
    expect(useGitStore.getState().getDirectoryState("/repo")?.status).toBe(initialStatus)
    expect(useGitStore.getState().getDirectoryState("/repo")?.indexRevision).toBe(0)
  })

  test("does nothing without status for optimistic moves", () => {
    useGitStore.setState({
      directories: new Map([["/repo", { ...createDirectoryState(createStatus()), status: null }]]),
      activeDirectory: "/repo",
    })

    const previousStatus = useGitStore.getState().moveStatusPathsOptimistically("/repo", ["src/index.ts"], "stage")

    expect(previousStatus).toBeNull()
    expect(useGitStore.getState().getDirectoryState("/repo")?.status).toBeNull()
  })

  test("removes entries that become clean during optimistic moves", () => {
    setDirectoryStatus(createStatus(undefined, [{ path: "clean.ts", index: " ", working_dir: " " }]))

    useGitStore.getState().moveStatusPathsOptimistically("/repo", ["clean.ts"], "stage")
    const status = useGitStore.getState().getDirectoryState("/repo")?.status

    expect(status?.files).toEqual([])
    expect(status?.isClean).toBe(true)
  })

  test("restores previous status for optimistic rollback", () => {
    const initialStatus = createStatus(undefined, [{ path: "src/index.ts", index: " ", working_dir: "M" }])
    setDirectoryStatus(initialStatus)

    const previousStatus = useGitStore.getState().moveStatusPathsOptimistically("/repo", ["src/index.ts"], "stage")
    useGitStore.getState().restoreStatus("/repo", previousStatus)

    expect(useGitStore.getState().getDirectoryState("/repo")?.status).toBe(initialStatus)
  })

  test("restaging different content with the same status letter reloads the staged diff", async () => {
    const file = { path: "src/index.ts", index: "M", working_dir: " ", indexBlobId: "a".repeat(40) }
    setDirectoryStatus(createStatus(undefined, [file]))
    const before = useGitStore.getState().getDirectoryState("/repo")?.indexRevision ?? 0
    const git = createGitApi(async () => createStatus(undefined, [{ ...file, indexBlobId: "b".repeat(40) }]))
    await useGitStore.getState().fetchStatus("/repo", git, { silent: true })
    expect(useGitStore.getState().getDirectoryState("/repo")?.indexRevision).toBe(before + 1)

    // Same index content again: no reload.
    await useGitStore.getState().fetchStatus("/repo", git, { silent: true })
    expect(useGitStore.getState().getDirectoryState("/repo")?.indexRevision).toBe(before + 1)
  })
})

describe("Git working-set retention", () => {
  beforeEach(() => useGitStore.setState({ directories: new Map(), repoSummaries: new Map(), activeDirectory: null }))

  test("projects beyond the cache limit keep their repository summary when evicted mid-read", async () => {
    const reads = new Map<string, Deferred<GitStatus>>()
    const api = createGitApi(async (directory) => {
      const read = createDeferred<GitStatus>()
      reads.set(directory, read)
      return read.promise
    })
    api.checkIsGitRepository = async (directory) => directory !== "/project/plain"
    const projects = [...Array.from({ length: 14 }, (_, i) => `/project/${i}`), "/project/plain"]
    const fetches = projects.map((directory) => useGitStore.getState().fetchStatus(directory, api))
    await Promise.resolve()
    await Promise.resolve()
    expect(useGitStore.getState().directories.has("/project/0")).toBe(false)
    for (const [directory, read] of reads) read.resolve({ ...createStatus(), current: `branch-${directory}` })
    await Promise.all(fetches)

    const state = useGitStore.getState()
    expect(state.directories.size).toBeLessThanOrEqual(10)
    // The evicted working set is not restored, but the sidebar summary survives for every project.
    expect(state.directories.has("/project/0")).toBe(false)
    expect(state.repoSummaries.get("/project/0")).toEqual({ isGitRepo: true, branch: "branch-/project/0" })
    expect(state.repoSummaries.get("/project/13")).toEqual({ isGitRepo: true, branch: "branch-/project/13" })
    expect(state.repoSummaries.get("/project/plain")).toEqual({ isGitRepo: false, branch: null })
    expect(state.repoSummaries.size).toBe(projects.length)
    let seen = new Map<string, { isGitRepo: boolean | null; branch: string | null }>()
    const Probe = () => {
      seen = useGitRepoStatusMap(projects)
      return null
    }
    const root = createRoot(document.createElement("div"))
    act(() => root.render(React.createElement(Probe)))
    act(() => root.unmount())
    expect(seen.get("/project/0")).toEqual({ isGitRepo: true, branch: "branch-/project/0" })
    expect(seen.get("/project/plain")).toEqual({ isGitRepo: false, branch: null })
  })

  test("removing a project drops its repository summary", async () => {
    const api = createGitApi(async () => createStatus())
    await useGitStore.getState().fetchStatus("/summary", api)
    expect(useGitStore.getState().repoSummaries.get("/summary")).toEqual({ isGitRepo: true, branch: "main" })
    useGitStore.getState().removeDirectory("/summary")
    expect(useGitStore.getState().repoSummaries.has("/summary")).toBe(false)
  })

  test("bounds visited directories and retains the active project", () => {
    for (let i = 0; i < 100; i++) useGitStore.getState().setActiveDirectory(`/visited/${i}`)
    expect(useGitStore.getState().directories.size).toBeLessThanOrEqual(10)
    expect(useGitStore.getState().directories.has("/visited/99")).toBe(true)
    expect(useGitStore.getState().directories.has("/visited/0")).toBe(false)
  })

  test("late log responses cannot restore an evicted project or overwrite its replacement", async () => {
    let finish!: (value: Awaited<ReturnType<GitStoreAPI["getGitLog"]>>) => void
    const pending = new Promise<Awaited<ReturnType<GitStoreAPI["getGitLog"]>>>((resolve) => { finish = resolve })
    const api = createGitApi(async () => createStatus())
    api.getGitLog = async () => pending
    useGitStore.getState().setActiveDirectory("/old")
    const oldRead = useGitStore.getState().fetchLog("/old", api)
    for (let i = 0; i < 20; i++) useGitStore.getState().setActiveDirectory(`/new/${i}`)
    expect(useGitStore.getState().directories.has("/old")).toBe(false)
    useGitStore.getState().setActiveDirectory("/old")
    finish({ all: [], latest: null, total: 999 })
    await oldRead
    expect(useGitStore.getState().directories.get("/old")?.log).toBeNull()
  })

  test("removing a project revokes its pending reads", async () => {
    let finish!: (value: Awaited<ReturnType<GitStoreAPI["getGitBranches"]>>) => void
    const pending = new Promise<Awaited<ReturnType<GitStoreAPI["getGitBranches"]>>>((resolve) => { finish = resolve })
    const api = createGitApi(async () => createStatus())
    api.getGitBranches = async () => pending
    useGitStore.getState().setActiveDirectory("/removed")
    const read = useGitStore.getState().fetchBranches("/removed", api)
    useGitStore.getState().removeDirectory("/removed")
    finish({ all: ["stale"], current: "stale", branches: {} })
    await read
    expect(useGitStore.getState().directories.has("/removed")).toBe(false)
    expect(useGitStore.getState().activeDirectory).toBeNull()
  })

  test("inactive directory payloads are evicted by size as well as count", async () => {
    useGitStore.getState().setActiveDirectory("/small")
    const api = createGitApi(async () => createStatus())
    api.getGitLog = async () => ({ all: [{
      hash: "fixture", date: "", message: "large", refs: "", body: "x".repeat(11 * 1024 * 1024),
      author_name: "fixture", author_email: "fixture@example.invalid", filesChanged: 0, insertions: 0,
      deletions: 0, parents: [],
    }], latest: null, total: 1 })
    await useGitStore.getState().fetchLog("/large", api)
    expect(useGitStore.getState().directories.has("/large")).toBe(false)
    expect(useGitStore.getState().directories.has("/small")).toBe(true)
  })
})
