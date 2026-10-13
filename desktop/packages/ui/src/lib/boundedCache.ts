/**
 * Insert into a FIFO-bounded Map cache, evicting the oldest entry once `max` is
 * reached. Every write to a bounded cache goes through here so the cap holds on
 * all paths — a bare `set` on one path grows the cache forever.
 */
export function setBoundedCacheEntry<V>(cache: Map<string, V>, max: number, key: string, value: V): void {
  if (cache.size >= max) {
    const oldestKey = cache.keys().next().value
    if (oldestKey !== undefined) {
      cache.delete(oldestKey)
    }
  }
  cache.set(key, value)
}
