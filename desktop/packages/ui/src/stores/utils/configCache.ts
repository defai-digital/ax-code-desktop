// Per-project config snapshots (plugins, MCP servers, skills, commands, …) are held in module-level
// maps keyed by directory. Their invalidation only ever removes the directory being changed, so a
// session that touches many projects kept every snapshot in memory for the app's lifetime. These
// helpers keep the most recently written few: a dropped project is re-read from disk when it is
// opened again, which is the same work the invalidation path already performs.
export const CONFIG_CACHE_MAX_ENTRIES = 10

export const setConfigCacheEntry = <T>(cache: Map<string, T>, key: string, value: T): void => {
  // Re-insert so the key moves to the end: the eviction below is least-recently-written.
  cache.delete(key)
  cache.set(key, value)

  const excess = cache.size - CONFIG_CACHE_MAX_ENTRIES
  if (excess <= 0) {
    return
  }

  for (const stale of Array.from(cache.keys()).slice(0, excess)) {
    cache.delete(stale)
  }
}
