import { describe, expect, it } from "vitest"
import { addCappedSetEntry, setCappedCacheEntry } from "./capped-cache.js"

describe("setCappedCacheEntry", () => {
  it("evicts the oldest entry once the cap is reached", () => {
    const cache = new Map()
    for (let i = 0; i < 600; i += 1) {
      setCappedCacheEntry(cache, `key-${i}`, i, 500)
    }
    expect(cache.size).toBe(500)
    expect(cache.has("key-0")).toBe(false)
    expect(cache.has("key-599")).toBe(true)
  })

  it("refreshes an existing key without evicting anything", () => {
    const cache = new Map()
    for (let i = 0; i < 500; i += 1) {
      setCappedCacheEntry(cache, `key-${i}`, i, 500)
    }
    setCappedCacheEntry(cache, "key-0", "updated", 500)
    expect(cache.size).toBe(500)
    expect(cache.get("key-0")).toBe("updated")
    expect(cache.has("key-1")).toBe(true)
  })

  it("defaults to 500 entries", () => {
    const cache = new Map()
    for (let i = 0; i < 600; i += 1) {
      setCappedCacheEntry(cache, `key-${i}`, i)
    }
    expect(cache.size).toBe(500)
  })
})

describe("addCappedSetEntry", () => {
  it("evicts the least recently added member once the cap is reached", () => {
    const set = new Set()
    for (let i = 0; i < 12; i += 1) {
      addCappedSetEntry(set, `s-${i}`, 10)
    }
    expect(set.size).toBe(10)
    expect(set.has("s-0")).toBe(false)
    expect(set.has("s-1")).toBe(false)
    expect(set.has("s-11")).toBe(true)
  })

  it("re-adding a member makes it the newest, so it survives the next eviction", () => {
    const set = new Set()
    for (let i = 0; i < 10; i += 1) {
      addCappedSetEntry(set, `s-${i}`, 10)
    }
    addCappedSetEntry(set, "s-0", 10)
    addCappedSetEntry(set, "s-new", 10)
    expect(set.size).toBe(10)
    expect(set.has("s-0")).toBe(true)
    expect(set.has("s-1")).toBe(false)
  })
})
