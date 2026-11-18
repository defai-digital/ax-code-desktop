import { beforeEach, describe, expect, test, vi } from "vitest"

import type { GitHubAPI, GitHubPullRequestStatus, RuntimeAPIs } from "@/lib/api/types"

const loadStore = async () => {
  const module = await import("./useGitHubPrStatusStore")
  return module
}

const makeStatus = (remoteName: string, number: number): GitHubPullRequestStatus => ({
  connected: true,
  resolvedRemoteName: remoteName,
  pr: {
    number,
    state: "open",
    draft: false,
    title: `${remoteName} PR`,
    url: `https://github.com/example/repo/pull/${number}`,
    base: "main",
    head: "feature",
    mergeable: true,
    mergeableState: "clean",
  },
  checks: {
    state: "success",
    total: 1,
    success: 1,
    failure: 0,
    pending: 0,
  },
  canMerge: true,
  repo: {
    owner: "example",
    repo: "repo",
    url: "https://github.com/example/repo",
  },
})

describe("useGitHubPrStatusStore", () => {
  beforeEach(() => {
    localStorage.removeItem("openchamber.github-pr-status")
    vi.resetModules()
  })

  test("separates PR status entries for different remotes on the same branch", async () => {
    const { getGitHubPrStatusKey, useGitHubPrStatusStore } = await loadStore()
    const prStatus = vi.fn(
      async (_directory: string, _branch: string, remote?: string): Promise<GitHubPullRequestStatus> =>
        makeStatus(remote ?? "origin", remote === "upstream" ? 22 : 11),
    )
    const github = { prStatus: prStatus as GitHubAPI["prStatus"] } as RuntimeAPIs["github"]

    const originKey = getGitHubPrStatusKey("/workspace/repo", "feature", "origin")
    const upstreamKey = getGitHubPrStatusKey("/workspace/repo", "feature", "upstream")

    useGitHubPrStatusStore.getState().ensureEntry(originKey)
    useGitHubPrStatusStore.getState().setParams(originKey, {
      directory: "/workspace/repo",
      branch: "feature",
      remoteName: "origin",
      canShow: true,
      github,
      githubAuthChecked: true,
      githubConnected: true,
    })

    useGitHubPrStatusStore.getState().ensureEntry(upstreamKey)
    useGitHubPrStatusStore.getState().setParams(upstreamKey, {
      directory: "/workspace/repo",
      branch: "feature",
      remoteName: "upstream",
      canShow: true,
      github,
      githubAuthChecked: true,
      githubConnected: true,
    })

    await useGitHubPrStatusStore.getState().refresh(originKey, { force: true })
    await useGitHubPrStatusStore.getState().refresh(upstreamKey, { force: true })

    expect(originKey).not.toBe(upstreamKey)
    expect(prStatus).toHaveBeenCalledTimes(2)
    expect(prStatus.mock.calls.map((call) => call[2])).toEqual(["origin", "upstream"])
    expect(useGitHubPrStatusStore.getState().entries[originKey]?.status?.pr?.number).toBe(11)
    expect(useGitHubPrStatusStore.getState().entries[upstreamKey]?.status?.pr?.number).toBe(22)
  })

  test.each(["success", "failure"])("ignores old remote %s after a watched key is rebound", async (completion) => {
    const { useGitHubPrStatusStore } = await loadStore()
    let resolveOld!: (status: GitHubPullRequestStatus) => void
    let rejectOld!: (error: Error) => void
    const old = new Promise<GitHubPullRequestStatus>((resolve, reject) => {
      resolveOld = resolve
      rejectOld = reject
    })
    const prStatus = vi.fn((_directory: string, _branch: string, remote?: string) =>
      remote === "origin" ? old : Promise.resolve(makeStatus("upstream", 22)),
    )
    const github = { prStatus } as unknown as GitHubAPI
    const store = useGitHubPrStatusStore.getState()
    const params = {
      directory: "/workspace/repo", branch: "feature", canShow: true,
      github, githubAuthChecked: true, githubConnected: true,
    }
    store.setParams("watch", { ...params, remoteName: "origin" })
    const previous = store.refresh("watch", { force: true })
    store.setParams("watch", { ...params, remoteName: "upstream" })
    await store.refresh("watch", { force: true })
    if (completion === "success") resolveOld(makeStatus("origin", 11))
    else rejectOld(new Error("old remote request failed"))
    await previous

    const current = useGitHubPrStatusStore.getState().entries.watch
    expect(current.status?.pr?.number).toBe(22)
    expect(current.error).toBeNull()
    expect(current.identity?.remoteName).toBe("upstream")
    expect(current.isLoading).toBe(false)
  })

  test("applies fresh status and preserves a body loaded during the read", async () => {
    const { useGitHubPrStatusStore } = await loadStore()
    let resolve!: (status: GitHubPullRequestStatus) => void
    const prStatus = vi.fn<GitHubAPI["prStatus"]>(() =>
      new Promise<GitHubPullRequestStatus>((done) => { resolve = done }),
    )
    const store = useGitHubPrStatusStore.getState()
    store.setParams("watch", {
      directory: "/repo", branch: "feature", remoteName: "origin", canShow: true,
      github: { prStatus } as unknown as GitHubAPI, githubAuthChecked: true, githubConnected: true,
    })
    const old = makeStatus("origin", 22)
    store.updateStatus("watch", () => old)

    const pending = store.refresh("watch")
    store.updateStatus("watch", () => ({ ...old, pr: { ...old.pr!, body: "Loaded body" } }))
    resolve({ ...old, pr: { ...old.pr!, title: "Fresh title" } })
    await pending

    expect(useGitHubPrStatusStore.getState().entries.watch.status?.pr).toMatchObject({
      title: "Fresh title", body: "Loaded body",
    })
  })

  test("a timed-out status read releases the scope and cannot delay a new read", async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(100_000)
      const { useGitHubPrStatusStore } = await loadStore()
      const prStatus = vi.fn<GitHubAPI["prStatus"]>()
        .mockImplementationOnce((_directory, _branch, _remote, options) =>
          new Promise((resolve) => {
            options?.signal?.addEventListener("abort", () => resolve(makeStatus("origin", 99)), { once: true })
          }),
        )
        .mockResolvedValueOnce(makeStatus("origin", 22))
      const store = useGitHubPrStatusStore.getState()
      store.setParams("watch", {
        directory: "/repo", branch: "feature", remoteName: "origin", canShow: true,
        github: { prStatus } as unknown as GitHubAPI, githubAuthChecked: true, githubConnected: true,
      })
      const first = store.refresh("watch")
      await vi.advanceTimersByTimeAsync(20_000)
      await first
      expect(useGitHubPrStatusStore.getState().entries.watch).toMatchObject({
        lastRefreshAt: 0, status: null, isLoading: false,
      })
      await store.refresh("watch")
      expect(prStatus).toHaveBeenCalledTimes(2)
      expect(useGitHubPrStatusStore.getState().entries.watch.status?.pr?.number).toBe(22)
    } finally {
      vi.useRealTimers()
    }
  })

  test("keeps only the most recently tracked entries", async () => {
    const { getGitHubPrStatusKey, useGitHubPrStatusStore } = await loadStore()
    useGitHubPrStatusStore.setState({ entries: {} })

    const keys = Array.from({ length: 60 }, (_, index) => getGitHubPrStatusKey(`/repo-${index}`, "main", "origin"))
    for (const key of keys) {
      useGitHubPrStatusStore.getState().ensureEntry(key)
    }

    const tracked = Object.keys(useGitHubPrStatusStore.getState().entries)
    // The map is persisted on every write, so an unbounded one grows memory and storage together.
    expect(tracked).toHaveLength(50)
    expect(tracked).toEqual(keys.slice(10))
  })

  test("never drops an entry something is still watching", async () => {
    const { getGitHubPrStatusKey, useGitHubPrStatusStore } = await loadStore()
    const watchedKey = getGitHubPrStatusKey("/watched", "main", "origin")
    useGitHubPrStatusStore.setState({
      entries: {
        [watchedKey]: {
          status: null,
          isLoading: false,
          error: null,
          isInitialStatusResolved: false,
          lastRefreshAt: 0,
          lastDiscoveryPollAt: 0,
          watchers: 1,
          params: null,
          identity: null,
          resolvedRemoteName: null,
        },
      },
    })

    for (let index = 0; index < 60; index += 1) {
      useGitHubPrStatusStore.getState().ensureEntry(getGitHubPrStatusKey(`/repo-${index}`, "main", "origin"))
    }

    const tracked = Object.keys(useGitHubPrStatusStore.getState().entries)
    expect(tracked).toContain(watchedKey)
    // The bound still holds: the slot is taken from the unwatched, least recent entries instead.
    expect(tracked).toHaveLength(50)
    expect(tracked).toContain(getGitHubPrStatusKey("/repo-59", "main", "origin"))
    expect(tracked).not.toContain(getGitHubPrStatusKey("/repo-0", "main", "origin"))
  })
})

describe("pruneExpiredPrRefreshTimestamps", () => {
  test("drops signatures whose revalidate TTL has passed and keeps fresh ones", async () => {
    const { pruneExpiredPrRefreshTimestamps } = await loadStore()
    const timestamps = new Map<string, number>([
      ["stale", 0],
      ["fresh", 80_000],
      ["future", 100_000],
    ])

    pruneExpiredPrRefreshTimestamps(timestamps, 90_000)

    expect([...timestamps.keys()]).toEqual(["fresh"])
  })
})

test("refreshes again after the wall clock moves behind the previous refresh", async () => {
  const clock = vi.spyOn(Date, "now").mockReturnValue(100_000)
  try {
    const { getGitHubPrStatusKey, useGitHubPrStatusStore } = await loadStore()
    const prStatus = vi.fn(async () => makeStatus("origin", 1))
    const key = getGitHubPrStatusKey("/clock-rollback", "feature", "origin")
    useGitHubPrStatusStore.getState().ensureEntry(key)
    useGitHubPrStatusStore.getState().setParams(key, {
      directory: "/clock-rollback",
      branch: "feature",
      remoteName: "origin",
      canShow: true,
      github: { prStatus: prStatus as GitHubAPI["prStatus"] } as RuntimeAPIs["github"],
      githubAuthChecked: true,
      githubConnected: true,
    })
    await useGitHubPrStatusStore.getState().refresh(key, { force: true })
    clock.mockReturnValue(99_000)
    await useGitHubPrStatusStore.getState().refresh(key)
    expect(prStatus).toHaveBeenCalledTimes(2)
  } finally {
    clock.mockRestore()
  }
})
