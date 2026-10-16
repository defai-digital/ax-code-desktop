"use strict"

const createMissingInstalledAppsCache = () => ({
  apps: [],
  hasCache: false,
  isCacheStale: true,
})

function normalizeInstalledAppsCache(cache, nowSecs, ttlSecs) {
  if (!cache || typeof cache !== "object" || Array.isArray(cache)) {
    return createMissingInstalledAppsCache()
  }

  if (!Array.isArray(cache.apps)) {
    return createMissingInstalledAppsCache()
  }

  const updatedAt = Number(cache.updatedAt)
  const hasUsableTimestamp = Number.isFinite(updatedAt) && updatedAt > 0 && updatedAt <= nowSecs
  const isCacheStale = !hasUsableTimestamp || nowSecs - updatedAt > ttlSecs

  return {
    apps: cache.apps,
    hasCache: true,
    isCacheStale,
  }
}

/**
 * Runs one installed-apps refresh at a time.
 *
 * The handler answers two windows (the main one and the mini-chat) and a `force` request can land
 * next to a stale-read refresh; each used to scan and write the cache independently. The writes are
 * a plain `writeFile` on the same path, so interleaved writers can leave a partial JSON file, and
 * the next read coerces the parse error to "no cache". A second request joins the run in flight
 * rather than starting its own.
 */
function createInstalledAppsRefresher({ build, writeCache }) {
  let inFlight = null

  return () => {
    if (inFlight) {
      return inFlight
    }
    inFlight = Promise.resolve()
      .then(() => build())
      .then((apps) => writeCache(apps))
      .finally(() => {
        inFlight = null
      })
    return inFlight
  }
}

module.exports = {
  createInstalledAppsRefresher,
  normalizeInstalledAppsCache,
}
