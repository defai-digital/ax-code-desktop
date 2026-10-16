import { describe, expect, it, vi } from "vitest"
import { clearPrStatusResolutionCaches, setCappedCacheEntry } from "./pr-status.js"

describe("pr-status repo resolution caches", () => {
  it("evicts the oldest entry instead of growing past the cap", () => {
    const cache = new Map()
    for (let index = 0; index < 200; index += 1) {
      setCappedCacheEntry(cache, `owner/repo-${index}`, { index })
    }
    expect(cache.size).toBe(200)

    setCappedCacheEntry(cache, "owner/repo-200", { index: 200 })

    expect(cache.size).toBe(200)
    expect(cache.has("owner/repo-0")).toBe(false)
    expect(cache.has("owner/repo-200")).toBe(true)
  })

  it("refreshes an existing key without evicting a different entry", () => {
    const cache = new Map()
    for (let index = 0; index < 200; index += 1) {
      setCappedCacheEntry(cache, `owner/repo-${index}`, { index })
    }

    setCappedCacheEntry(cache, "owner/repo-0", { index: 999 })

    expect(cache.size).toBe(200)
    expect(cache.get("owner/repo-0")).toEqual({ index: 999 })
    expect(cache.has("owner/repo-1")).toBe(true)
  })
})

vi.mock("../git/index.js", () => ({
  getStatus: vi.fn(async () => ({ branch: "feature", tracking: "origin/feature", files: [] })),
  getRemotes: vi.fn(async () => [{ name: "origin", refs: { fetch: "git@github.com:owner/repo.git", push: "git@github.com:owner/repo.git" } }]),
}))
vi.mock("./repo/index.js", () => ({
  resolveGitHubRepoFromDirectory: vi.fn(async () => ({ repo: { owner: "owner", repo: "repo" } })),
}))

const { resolveGitHubPrStatus } = await import("./pr-status.js")

describe("resolveGitHubPrStatus on a rate-limit 403", () => {
  it("propagates the error instead of caching a degraded answer", async () => {
    // A rate-limited 403 must reach the route's (non-cached) degraded branch: swallowing
    // it as "no PRs" cached the wrong answer for the whole PR status TTL.
    const octokit = {
      rest: {
        pulls: {
          list: vi.fn(async () => {
            throw Object.assign(new Error("rate limited"), { status: 403 })
          }),
        },
        repos: {
          get: vi.fn(async () => {
            throw Object.assign(new Error("rate limited"), { status: 403 })
          }),
        },
        search: { issuesAndPullRequests: vi.fn(async () => { throw Object.assign(new Error("rate limited"), { status: 403 }) }) },
      },
    }

    await expect(resolveGitHubPrStatus({ octokit, directory: "/tmp/repo", branch: "feature" })).rejects.toMatchObject({
      status: 403,
    })
  })
})

describe("the search fallback's 403 memo", () => {
  const octokitWithSearch = (search) => ({
    rest: {
      pulls: {
        list: vi.fn(async () => ({ data: [] })),
        get: vi.fn(async () => ({ data: {} })),
      },
      repos: { get: vi.fn(async () => ({ data: { default_branch: "main", private: false } })) },
      search: { issuesAndPullRequests: search },
    },
  })

  it("is dropped when the account-scoped caches are cleared", async () => {
    // The memo records a permission denial for a repo set, which is account-scoped state: after a
    // switch to a properly scoped account it kept answering "no pull request" for the whole window.
    const forbidden = vi.fn(async () => {
      throw Object.assign(new Error("forbidden"), { status: 403 })
    })
    await resolveGitHubPrStatus({ octokit: octokitWithSearch(forbidden), directory: "/tmp/repo", branch: "feature" })

    expect(forbidden).toHaveBeenCalled()

    clearPrStatusResolutionCaches()

    // A different branch so the per-branch result cache cannot answer for the search API.
    const allowed = vi.fn(async () => ({ data: { items: [] } }))
    await resolveGitHubPrStatus({ octokit: octokitWithSearch(allowed), directory: "/tmp/repo", branch: "other" })

    expect(allowed).toHaveBeenCalled()
  })
})
