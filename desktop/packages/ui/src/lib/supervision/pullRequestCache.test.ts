import { afterEach, describe, expect, test, vi } from "vitest"
import type { GitHubPullRequestStatus } from "@/lib/api/types"
import { createPullRequestCache, projectPullRequest, pullRequestKey, type PullRequestTarget } from "./pullRequestCache"
import { filterMissionFacets } from "./missionControl"
import type { SupervisionRow } from "./rows"

const pr = { number: 42, state: "open" as const, checks: "failed" as const }
const target = (branch = "feature"): PullRequestTarget => ({
  directory: "/repo",
  branch,
  storeKey: branch,
  pr,
  fetchedAt: 0,
})
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve()
}
afterEach(() => vi.useRealTimers())

describe("bounded PR demand", () => {
  test("deduplicates normalized directory/branch across consumers and caps concurrency at two", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(100_000)
    const resolve: Array<(value: typeof pr) => void> = []
    const fetch = vi.fn(() => new Promise<typeof pr>((done) => resolve.push(done)))
    const cache = createPullRequestCache(fetch)
    const a = cache.mount(),
      b = cache.mount()
    a.update([target("a"), target("b"), target("c")])
    b.update([target("a")])
    expect(fetch).toHaveBeenCalledTimes(2)
    resolve[0](pr)
    await flush()
    expect(fetch).toHaveBeenCalledTimes(3)
    resolve[1](pr)
    resolve[2](pr)
    await flush()
    a.update([target("a"), target("b"), target("c")])
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(pullRequestKey("c:\\Work\\Repo\\", "feat")).toBe(pullRequestKey("C:/work/repo", "feat"))
    expect(pullRequestKey("//SERVER/Share/", "feat")).toBe(pullRequestKey("\\\\server\\share", "feat"))
    expect(pullRequestKey("/repo", "feat")).not.toBe(pullRequestKey("/Repo", "feat"))
    expect(pullRequestKey("/repo", "other")).not.toBe(pullRequestKey("/repo", "feat"))
    a.dispose()
    b.dispose()
  })
  test("bounds entries at 300 without eviction refetch churn and stops timers when demand ends", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(100_000)
    const fetch = vi.fn(async () => pr)
    const cache = createPullRequestCache(fetch)
    const demand = cache.mount()
    const rows = Array.from({ length: 305 }, (_, i) => target(String(i)))
    demand.update(rows)
    for (let i = 0; i < 310; i++) await flush()
    expect(fetch).toHaveBeenCalledTimes(305)
    expect(cache.getSnapshot().size).toBe(300)
    demand.update(rows)
    await flush()
    expect(fetch).toHaveBeenCalledTimes(305)
    await vi.advanceTimersByTimeAsync(89_999)
    expect(fetch).toHaveBeenCalledTimes(305)
    demand.dispose()
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(200_000)
    expect(fetch).toHaveBeenCalledTimes(305)
  })
  test("marks retained PR stale, backs off failures even on remount, then recovers", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(100_000)
    const fetch = vi.fn().mockRejectedValueOnce(new Error("private failure")).mockResolvedValue(pr)
    const cache = createPullRequestCache(fetch)
    const demand = cache.mount()
    demand.update([target()])
    await flush()
    expect(cache.getSnapshot().get(pullRequestKey("/repo", "feature"))).toEqual({ pr, fetchedAt: 100_000, stale: true })
    demand.update([target()])
    demand.dispose()
    const again = cache.mount()
    again.update([target()])
    await flush()
    expect(fetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(29_999)
    expect(fetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(cache.getSnapshot().get(pullRequestKey("/repo", "feature"))?.stale).toBeUndefined()
    again.dispose()
  })
  test("aborts stuck requests, frees slots and ignores late completion", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(100_000)
    const signals: AbortSignal[] = []
    const completions: Array<(value: typeof pr) => void> = []
    const fetch = vi.fn((_target: PullRequestTarget, signal: AbortSignal) => {
      signals.push(signal)
      return new Promise<typeof pr>((resolve) => {
        completions.push(resolve)
      })
    })
    const cache = createPullRequestCache(fetch, { timeoutMs: 100 })
    const demand = cache.mount()
    demand.update([target("a"), target("b"), target("c")])
    expect(fetch).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(100)
    expect(signals[0].aborted).toBe(true)
    expect(signals[1].aborted).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(3)
    const before = cache.getSnapshot().get(pullRequestKey("/repo", "b"))
    completions[1]({ ...pr, number: 99 })
    await flush()
    expect(cache.getSnapshot().get(pullRequestKey("/repo", "b"))).toBe(before)
    demand.dispose()
    await vi.advanceTimersByTimeAsync(100)
    expect(vi.getTimerCount()).toBe(0)
  })
})

const status = (overrides: Partial<GitHubPullRequestStatus> = {}): GitHubPullRequestStatus => ({
  connected: true,
  pr: {
    number: 42,
    state: "open",
    draft: false,
    title: "CI passed",
    body: "All checks passed",
    url: "https://example.test",
    base: "main",
    head: "feature",
  },
  ...overrides,
})
test("projects only structured states and hides unknown or empty checks, even when text claims success", () => {
  expect(projectPullRequest(status())).toEqual({ number: 42, state: "open" })
  for (const state of ["success", "failure", "pending", "unknown"] as const) {
    expect(
      projectPullRequest(status({ checks: { state, total: 1, success: 0, failure: 0, pending: 0 } }))?.checks,
    ).toBe({ success: "passed", failure: "failed", pending: "pending", unknown: undefined }[state])
  }
  expect(
    projectPullRequest(status({ checks: { state: "success", total: 0, success: 0, failure: 0, pending: 0 } }))?.checks,
  ).toBeUndefined()
  expect(projectPullRequest(status({ connected: false }))).toBeNull()
  expect(projectPullRequest(status({ pr: null }))).toBeNull()
  for (const state of ["open", "closed", "merged"] as const) {
    expect(projectPullRequest(status({ pr: { ...status().pr!, state, draft: true } }))?.state).toBe(
      state === "open" ? "draft" : state,
    )
  }
})

test("PR facet ANDs other facets, includes drafts, and excludes stale or unknown checks and runtime-only failures", () => {
  const base: SupervisionRow = {
    sessionId: "1",
    title: "All CI passed",
    state: "running",
    updatedAt: 1,
    treeSessionIds: ["1"],
    projectId: "p",
    projectLabel: "P",
    directory: "/repo",
    evidence: null,
    goal: null,
  }
  const rows = [
    { ...base, sessionId: "open", pullRequest: pr },
    { ...base, sessionId: "draft", pullRequest: { ...pr, state: "draft" as const, checks: undefined } },
    { ...base, sessionId: "merged", pullRequest: { ...pr, state: "merged" as const, checks: "passed" as const } },
    { ...base, sessionId: "closed", pullRequest: { ...pr, state: "closed" as const, checks: "pending" as const } },
    { ...base, sessionId: "stale", pullRequest: { ...pr, stale: true } },
    { ...base, sessionId: "runtime", checks: { state: "failed" as const, passed: 0, failed: 1, total: 1 } },
  ]
  const facets = { query: "", status: "all" as const, projectKeys: [], hasChanges: false }
  expect(filterMissionFacets(rows, { ...facets, pr: "open" }).map((r) => r.sessionId)).toEqual(["open", "draft"])
  expect(filterMissionFacets(rows, { ...facets, pr: "failing" }).map((r) => r.sessionId)).toEqual(["open"])
  expect(filterMissionFacets(rows, { ...facets, pr: "failing", projectKeys: ["other"] })).toEqual([])
  expect(filterMissionFacets(rows, { ...facets, pr: "open", hasChanges: true })).toEqual([])
  expect(filterMissionFacets(rows, { ...facets, pr: "all" })).toHaveLength(6)
})
