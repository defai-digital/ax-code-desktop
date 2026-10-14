import { setCappedCacheEntry } from "../capped-cache.js"

const DEFAULT_TTL_MS = 30 * 60 * 1000
// Scans are keyed by repo + subpath + identity, so a long-lived server that has
// looked at many repositories accumulated one entry per key forever: expiry was
// only ever checked for the key being read.
const MAX_CACHE_ENTRIES = 500

const cache = new Map()

const pruneExpired = (now) => {
  for (const [key, entry] of cache.entries()) {
    if (!entry || typeof entry.expiresAt !== "number" || now >= entry.expiresAt) {
      cache.delete(key)
    }
  }
}

export function getCacheKey({ normalizedRepo, subpath, identityId }) {
  const safeRepo = String(normalizedRepo || "").trim()
  const safeSubpath = String(subpath || "").trim()
  const safeIdentity = String(identityId || "").trim()
  return `${safeRepo}::${safeSubpath}::${safeIdentity}`
}

export function getCachedScan(key) {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() >= entry.expiresAt) {
    cache.delete(key)
    return null
  }
  return entry.value
}

export function setCachedScan(key, value, ttlMs = DEFAULT_TTL_MS) {
  const ttl = Number.isFinite(ttlMs) ? ttlMs : DEFAULT_TTL_MS
  const now = Date.now()
  pruneExpired(now)
  // Re-insert so the map's insertion order stays the eviction order.
  cache.delete(key)
  setCappedCacheEntry(cache, key, { expiresAt: now + ttl, value }, MAX_CACHE_ENTRIES)
}

export function clearCache() {
  cache.clear()
}
