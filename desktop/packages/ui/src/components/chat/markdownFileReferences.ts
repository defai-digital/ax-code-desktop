import { API_ENDPOINTS } from "@/lib/http"

/**
 * Normalize a path the way chat-rendered file references handle them: forward
 * slashes, collapsed separators, preserved UNC prefix, and no trailing slash
 * except on a root.
 */
export const normalizePath = (value: string): string => {
  const source = (value || "").trim()
  if (!source) {
    return ""
  }

  const withSlashes = source.replace(/\\/g, "/")
  const hadUncPrefix = withSlashes.startsWith("//")

  let normalized = withSlashes.replace(/\/+/g, "/")
  if (hadUncPrefix && !normalized.startsWith("//")) {
    normalized = `/${normalized}`
  }

  const isUnixRoot = normalized === "/"
  const isWindowsDriveRoot = /^[A-Za-z]:\/$/.test(normalized)
  if (!isUnixRoot && !isWindowsDriveRoot) {
    normalized = normalized.replace(/\/+$/, "")
  }

  return normalized
}

const FILE_REFERENCE_STAT_CONCURRENCY = 4
const FILE_REFERENCE_STAT_CACHE_MAX = 1000
// A "missing" verdict only holds briefly: the agent creates files as the session
// runs, so a reference rendered before its file existed has to start resolving
// once the file appears — holding the miss until the LRU evicts it left the
// reference dead for the rest of the session. Hits stay cached, and a transient
// stat failure is retried on the same schedule.
const FILE_REFERENCE_STAT_NEGATIVE_TTL_MS = 10_000

const statCache = new Map<string, Promise<boolean>>()
let activeFileReferenceStatCount = 0
const pendingFileReferenceStats: Array<() => void> = []

export const fileReferenceExists = (resolvedPath: string): Promise<boolean> => {
  const normalizedPath = normalizePath(resolvedPath)
  if (!normalizedPath) {
    return Promise.resolve(false)
  }

  const cached = statCache.get(normalizedPath)
  if (cached) {
    statCache.delete(normalizedPath)
    statCache.set(normalizedPath, cached)
    return cached
  }

  const request = new Promise<boolean>((resolve) => {
    const settle = (exists: boolean) => {
      if (!exists) {
        setTimeout(() => {
          if (statCache.get(normalizedPath) === request) {
            statCache.delete(normalizedPath)
          }
        }, FILE_REFERENCE_STAT_NEGATIVE_TTL_MS)
      }
      resolve(exists)
    }

    const run = () => {
      activeFileReferenceStatCount += 1
      void fetch(`${API_ENDPOINTS.fs.stat}?path=${encodeURIComponent(normalizedPath)}`, {
        method: "GET",
        cache: "no-store",
      })
        .then((response) => settle(response.ok))
        .catch(() => settle(false))
        .finally(() => {
          activeFileReferenceStatCount = Math.max(0, activeFileReferenceStatCount - 1)
          pendingFileReferenceStats.shift()?.()
        })
    }

    if (activeFileReferenceStatCount < FILE_REFERENCE_STAT_CONCURRENCY) {
      run()
      return
    }

    pendingFileReferenceStats.push(run)
  })

  while (statCache.size >= FILE_REFERENCE_STAT_CACHE_MAX) {
    const oldest = statCache.keys().next().value
    if (typeof oldest !== "string") {
      break
    }
    statCache.delete(oldest)
  }
  statCache.set(normalizedPath, request)
  return request
}
