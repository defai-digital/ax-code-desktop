import { getGitStatus } from "@/lib/gitApi"
import { readPathOutput } from "@/lib/pathValues"
import { execCommand } from "@/lib/execCommands"
import { normalizeWorktreePath } from "@/lib/worktrees/path"
import type { WorktreeMetadata } from "@/types/worktree"

const toAbsolutePath = (baseDir: string, maybeRelativePath: string): string => {
  const normalizedBase = normalizeWorktreePath(baseDir)
  const normalizedInput = normalizeWorktreePath(maybeRelativePath)
  if (!normalizedInput) return normalizedBase
  if (normalizedInput.startsWith("/") || /^[A-Za-z]:\//.test(normalizedInput)) return normalizedInput

  const stack = normalizedBase.split("/").filter(Boolean)
  const parts = normalizedInput.split("/").filter(Boolean)
  for (const part of parts) {
    if (part === ".") continue
    if (part === "..") {
      stack.pop()
      continue
    }
    stack.push(part)
  }
  let prefix = "/"
  if (normalizedBase.startsWith("//")) prefix = "//"
  else if (/^[A-Za-z]:\//.test(normalizedBase)) prefix = ""
  return `${prefix}${stack.join("/")}`
}

const derivePrimaryWorktreeRootFromGitDir = (gitDir: string): string | null => {
  const normalized = normalizeWorktreePath(gitDir)
  if (!normalized) return null
  if (normalized.endsWith("/.git")) {
    return normalized.slice(0, -"/.git".length) || null
  }
  const worktreesMarker = "/.git/worktrees/"
  const markerIndex = normalized.indexOf(worktreesMarker)
  if (markerIndex > 0) {
    return normalized.slice(0, markerIndex) || null
  }
  return null
}

export async function getWorktreeStatus(worktreePath: string): Promise<WorktreeMetadata["status"]> {
  const normalizedPath = normalizeWorktreePath(worktreePath)
  const status = await getGitStatus(normalizedPath)
  return {
    isDirty: !status.isClean,
    ahead: status.ahead,
    behind: status.behind,
    upstream: status.tracking,
  }
}

// Resolving a project's root (primary worktree) requires shelling out to
// `git rev-parse`, whose answer is effectively static for the lifetime of a
// session — the location of a repo's git directory does not change while the
// app is open. Caching it (with in-flight dedupe) collapses what used to be an
// N² burst of `/api/fs/exec` calls into roughly one resolution per directory.
const RESOLVED_ROOT_TTL_MS = 60_000
const RESOLVED_ROOT_CACHE_MAX_ENTRIES = 500
const RESOLVED_ROOT_CACHE_MAX_BYTES = 1024 * 1024
const resolvedRootCache = new Map<string, { root: string; resolvedAt: number }>()
const inFlightRootResolves = new Map<string, Promise<string>>()
// Bumped on every invalidation so a resolution that was already in flight when
// the cache was invalidated does not write its now-stale result back.
let resolveCacheEpoch = 0

const resolvedRootEntryBytes = (directory: string, root: string): number => directory.length + root.length

const setResolvedRootCacheEntry = (directory: string, root: string): void => {
  resolvedRootCache.delete(directory)
  resolvedRootCache.set(directory, { root, resolvedAt: Date.now() })

  let totalBytes = 0
  for (const [key, entry] of resolvedRootCache) {
    totalBytes += resolvedRootEntryBytes(key, entry.root)
  }

  while (
    resolvedRootCache.size > RESOLVED_ROOT_CACHE_MAX_ENTRIES ||
    (totalBytes > RESOLVED_ROOT_CACHE_MAX_BYTES && resolvedRootCache.size > 1)
  ) {
    const oldest = resolvedRootCache.entries().next().value
    if (!oldest) {
      break
    }
    totalBytes -= resolvedRootEntryBytes(oldest[0], oldest[1].root)
    resolvedRootCache.delete(oldest[0])
  }
}

/**
 * Invalidate cached project-root resolutions. Call this when the worktree
 * topology changes (e.g. after creating or removing a worktree), since that can
 * alter which primary root a directory resolves to. With no argument, the whole
 * cache is cleared.
 */
export function invalidateResolvedProjectRootCache(directory?: string): void {
  // Bumping the epoch prevents any in-flight resolution from re-seeding the
  // cache with its pre-invalidation result once it settles.
  resolveCacheEpoch += 1
  if (typeof directory === "string" && directory) {
    const normalized = normalizeWorktreePath(directory)
    resolvedRootCache.delete(normalized)
    // Drop the in-flight entry too, so callers arriving during the window
    // trigger a fresh resolution instead of receiving the stale in-flight one.
    inFlightRootResolves.delete(normalized)
    return
  }
  resolvedRootCache.clear()
  inFlightRootResolves.clear()
}

const computeProjectRoot = async (directory: string): Promise<string> => {
  // Query one path at a time: line-splitting a combined response is ambiguous
  // when a real directory name contains a newline. Most roots need only the first query.
  const result = await execCommand("git rev-parse --absolute-git-dir", directory)
  if (!result.success) return directory
  const platform = /^(?:[A-Za-z]:|\\\\|\/\/)/.test(directory) ? "win32" : undefined
  const absoluteGitDir = normalizeWorktreePath(readPathOutput(result.stdout, platform))
  if (absoluteGitDir) {
    const root = derivePrimaryWorktreeRootFromGitDir(absoluteGitDir)
    if (root) return root
  }

  const common = await execCommand("git rev-parse --git-common-dir", directory)
  if (!common.success) return directory
  const rawCommonDir = normalizeWorktreePath(readPathOutput(common.stdout, platform))
  if (rawCommonDir) {
    const root = derivePrimaryWorktreeRootFromGitDir(toAbsolutePath(directory, rawCommonDir))
    if (root) return root
  }

  return directory
}

export const resolveProjectRoot = async (directory: string): Promise<string> => {
  const cached = resolvedRootCache.get(directory)
  if (cached && Date.now() - cached.resolvedAt < RESOLVED_ROOT_TTL_MS) {
    // Refresh recency without extending TTL.
    resolvedRootCache.delete(directory)
    resolvedRootCache.set(directory, cached)
    return cached.root
  }
  if (cached) {
    resolvedRootCache.delete(directory)
  }

  const inflight = inFlightRootResolves.get(directory)
  if (inflight) {
    return inflight
  }

  const startEpoch = resolveCacheEpoch
  const promise = computeProjectRoot(directory)
    .then((root) => {
      // Skip the write-back if the cache was invalidated while we resolved.
      if (resolveCacheEpoch === startEpoch) {
        setResolvedRootCacheEntry(directory, root)
      }
      return root
    })
    .catch(() => directory)
    .finally(() => {
      if (inFlightRootResolves.get(directory) === promise) {
        inFlightRootResolves.delete(directory)
      }
    })

  inFlightRootResolves.set(directory, promise)
  return promise
}

export async function getRootBranch(projectDirectory: string, options?: { knownBranch?: string }): Promise<string> {
  const normalizedPath = normalizeWorktreePath(projectDirectory)
  if (!normalizedPath) {
    return "HEAD"
  }

  try {
    const projectRoot = await resolveProjectRoot(normalizedPath).catch(() => normalizedPath)

    // Fast path: when a project directory *is* its own root (i.e. not a linked
    // worktree), the caller's already-known branch refers to the root branch,
    // so we can skip a redundant git status round-trip. For linked worktrees the
    // root branch differs from the worktree's branch, so we must fetch it.
    const knownBranch = options?.knownBranch?.trim()
    if (knownBranch && projectRoot === normalizedPath) {
      return knownBranch
    }

    const status = await getGitStatus(projectRoot)
    const branch = typeof status.current === "string" ? status.current.trim() : ""
    return branch || "HEAD"
  } catch {
    return "HEAD"
  }
}
