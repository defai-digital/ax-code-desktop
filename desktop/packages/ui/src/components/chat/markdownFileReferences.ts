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

const WINDOWS_DRIVE_PATH_PATTERN = /^[A-Za-z]:[\\/]/
const WINDOWS_UNC_PATH_PATTERN = /^\\\\[^\\]+\\[^\\]+/

export const isAbsolutePath = (value: string): boolean => {
  return (
    value.startsWith("/") ||
    WINDOWS_DRIVE_PATH_PATTERN.test(value) ||
    WINDOWS_UNC_PATH_PATTERN.test(value) ||
    value.startsWith("//")
  )
}

export const toAbsolutePath = (basePath: string, targetPath: string): string => {
  const normalizedTarget = normalizePath(targetPath)
  if (!normalizedTarget) {
    return normalizePath(basePath)
  }

  if (isAbsolutePath(normalizedTarget)) {
    return normalizedTarget
  }

  const normalizedBase = normalizePath(basePath)
  if (!normalizedBase) {
    return normalizedTarget
  }

  const isWindowsDriveBase = /^[A-Za-z]:/.test(normalizedBase)
  const prefix = isWindowsDriveBase ? normalizedBase.slice(0, 2) : ""
  // A UNC base (`//server/share/...`) must keep both its leading slashes: rebuilding it as
  // `/server/share/...` names a different path, and a `..` could pop the share segment.
  const isUncBase = !isWindowsDriveBase && normalizedBase.startsWith("//")
  const baseRemainder = isWindowsDriveBase || isUncBase ? normalizedBase.slice(2) : normalizedBase

  const stack = baseRemainder.split("/").filter(Boolean)
  const minStackDepth = isUncBase ? Math.min(2, stack.length) : 0
  const parts = normalizedTarget.split("/").filter(Boolean)
  for (const part of parts) {
    if (part === ".") {
      continue
    }
    if (part === "..") {
      if (stack.length > minStackDepth) {
        stack.pop()
      }
      continue
    }
    stack.push(part)
  }

  if (isWindowsDriveBase) {
    return `${prefix}/${stack.join("/")}`
  }

  if (isUncBase) {
    return `//${stack.join("/")}`
  }

  return `/${stack.join("/")}`
}
