import { describe, expect, it } from "vitest"
import { setCappedCacheEntry } from "./pr-status.js"

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
