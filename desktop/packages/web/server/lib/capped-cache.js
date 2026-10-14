/**
 * Insert into a Map that must not grow without bound, evicting the oldest entry.
 *
 * The same rule the git-read and repo-resolution caches already follow; the session-
 * keyed notification caches used to grow one entry per session over a long-lived
 * desktop process instead.
 */
export const setCappedCacheEntry = (cache, key, value, maxEntries = 500) => {
  if (cache.size >= maxEntries && !cache.has(key)) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) {
      cache.delete(oldest)
    }
  }
  cache.set(key, value)
}
