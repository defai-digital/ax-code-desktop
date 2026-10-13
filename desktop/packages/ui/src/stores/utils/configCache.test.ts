import { describe, expect, test } from "vitest"
import { CONFIG_CACHE_MAX_ENTRIES, setConfigCacheEntry } from "./configCache"

describe("config cache bound", () => {
  test("keeps the most recently written entries", () => {
    const cache = new Map<string, string>()
    for (let index = 0; index < 25; index += 1) {
      setConfigCacheEntry(cache, `project-${index}`, `value-${index}`)
    }

    expect(cache.size).toBe(CONFIG_CACHE_MAX_ENTRIES)
    // Switching back to an older project is simply a re-read; keeping every snapshot is not.
    expect(cache.has("project-0")).toBe(false)
    expect(cache.has("project-24")).toBe(true)
  })

  test("re-writing a key refreshes its position instead of evicting it", () => {
    const cache = new Map<string, string>()
    for (let index = 0; index < CONFIG_CACHE_MAX_ENTRIES; index += 1) {
      setConfigCacheEntry(cache, `project-${index}`, `value-${index}`)
    }

    setConfigCacheEntry(cache, "project-0", "refreshed")
    setConfigCacheEntry(cache, "project-new", "value-new")

    expect(cache.get("project-0")).toBe("refreshed")
    expect(cache.has("project-1")).toBe(false)
    expect(cache.size).toBe(CONFIG_CACHE_MAX_ENTRIES)
  })
})
