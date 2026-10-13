import { describe, expect, test } from "vitest"
import { setBoundedCacheEntry } from "./boundedCache"

describe("setBoundedCacheEntry", () => {
  test("evicts the oldest entry once the cache is full", () => {
    const cache = new Map<string, string>()
    setBoundedCacheEntry(cache, 2, "a", "1")
    setBoundedCacheEntry(cache, 2, "b", "2")
    setBoundedCacheEntry(cache, 2, "c", "3")

    expect([...cache.keys()]).toEqual(["b", "c"])
  })

  test("caps growth on every write, including repeated fallback writes", () => {
    // The no-grammar and highlight-failure fallbacks used to bypass the cap; every
    // write now goes through the bounded setter.
    const cache = new Map<string, string>()
    for (let index = 0; index < 10; index += 1) {
      setBoundedCacheEntry(cache, 3, `key-${index}`, "x")
    }

    expect(cache.size).toBe(3)
    expect([...cache.keys()]).toEqual(["key-7", "key-8", "key-9"])
  })

  test("rewriting an existing key does not evict", () => {
    const cache = new Map<string, string>()
    setBoundedCacheEntry(cache, 2, "a", "1")
    setBoundedCacheEntry(cache, 2, "b", "2")
    setBoundedCacheEntry(cache, 2, "a", "updated")

    expect(cache.size).toBe(2)
    expect(cache.get("a")).toBe("updated")
  })
})
