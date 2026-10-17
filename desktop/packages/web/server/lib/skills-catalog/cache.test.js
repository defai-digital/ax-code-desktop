import { afterEach, describe, expect, it } from "vitest"

import { clearCache, getCacheKey, getCachedScan, setCachedScan } from "./cache.js"

afterEach(() => {
  clearCache()
})

describe("skills scan cache", () => {
  it("evicts the oldest scans instead of growing with every repository visited", () => {
    // Keys are repo + subpath + identity, so a long-lived server accumulated one
    // entry per key forever: expiry was only checked for the key being read.
    for (let index = 0; index < 700; index += 1) {
      setCachedScan(`repo-${index}::`, { index }, 60_000)
    }

    expect(getCachedScan("repo-699::")).toEqual({ index: 699 })
    expect(getCachedScan("repo-0::")).toBeNull()
  })

  it("keeps two hosts that name the same repository apart", () => {
    // `github.com/anthropics/skills` and a self-hosted `gitlab.example.com/anthropics/skills` are different
    // repositories with different clone targets. Keyed by `owner/repo` alone the second source was answered from
    // the first one's cache entry — its items carry that source's clone URL, so installing "from" it installed the
    // other host's code — and the collision lasted the whole 30-minute TTL.
    const githubKey = getCacheKey({ host: "github.com", normalizedRepo: "anthropics/skills", subpath: "skills" })
    const gitlabKey = getCacheKey({ host: "gitlab.example.com", normalizedRepo: "anthropics/skills", subpath: "skills" })

    expect(githubKey).not.toBe(gitlabKey)

    setCachedScan(gitlabKey, { items: [{ repoSource: "git@gitlab.example.com:anthropics/skills" }] })

    expect(getCachedScan(githubKey)).toBeNull()
  })

  it("expires a scan once its TTL has passed", () => {
    setCachedScan("repo-expired::", { stale: true }, -1)

    expect(getCachedScan("repo-expired::")).toBeNull()
  })

  it("returns the stored scan while it is fresh", () => {
    setCachedScan("repo-fresh::", { fresh: true }, 60_000)

    expect(getCachedScan("repo-fresh::")).toEqual({ fresh: true })
  })
})
