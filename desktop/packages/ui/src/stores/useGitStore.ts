import React from "react"
import { create } from "zustand"
import { devtools } from "zustand/middleware"
import type { GitStatus, GitBranch, GitLogResponse, GitIdentitySummary, GitAPI as RuntimeGitAPI } from "@/lib/api/types"
import { retainedPayloadSize } from "@/lib/retainedPayloadSize"
import { collectChangedDiffStatPaths, combinedDiffStatsForPath } from "@/lib/git/diffStats"

const LOG_STALE_THRESHOLD = 10000
const REPO_CHECK_STALE_THRESHOLD = 60_000
const STATUS_STALE_THRESHOLD = 5_000
const BRANCHES_STALE_THRESHOLD = 30_000
const IDENTITY_STALE_THRESHOLD = 60_000
const DIFF_PREFETCH_MAX_FILES = 25
const DIFF_PREFETCH_FOCUS_MAX_FILES = 40
const DIFF_PREFETCH_CONCURRENCY = 2
const DIFF_PREFETCH_TIMEOUT_MS = 15000
const DIFF_PREFETCH_LARGE_FILE_THRESHOLD = 500 // skip prefetch for files with >500 changed lines

// Diff cache limits to prevent memory bloat with many modified files
const DIFF_CACHE_MAX_ENTRIES = 30
const DIFF_CACHE_MAX_TOTAL_SIZE_BYTES = 20 * 1024 * 1024 // 20MB
export const GIT_DIRECTORY_CACHE_LIMIT = 10
export const GIT_DIRECTORY_CACHE_MAX_BYTES = 20 * 1024 * 1024
const GIT_DIRECTORY_IDLE_TTL_MS = 20 * 60 * 1000
const directoryAccessedAt = new Map<string, number>()
type GitStatusFetchMode = "full" | "light"
export type GitStoreAPI = Pick<
  RuntimeGitAPI,
  "checkIsGitRepository" | "getGitStatus" | "getGitBranches" | "getGitLog" | "getCurrentGitIdentity" | "getGitFileDiff"
>

interface DirectoryGitState {
  isGitRepo: boolean | null
  status: GitStatus | null
  branches: GitBranch | null
  log: GitLogResponse | null
  identity: GitIdentitySummary | null
  diffCache: Map<string, { original: string; modified: string; fetchedAt: number; isBinary?: boolean }>
  indexRevision: number
  lastRepoCheckAt: number
  lastStatusFetch: number
  lastStatusChange: number
  lastLogFetch: number
  lastBranchesFetch: number
  lastIdentityFetch: number
  logMaxCount: number
  isLoadingStatus: boolean
  isLoadingLog: boolean
  isLoadingBranches: boolean
  isLoadingIdentity: boolean
}

/** What the sidebar shows for a project; it outlives the bounded per-directory working set. */
export interface GitRepoSummary {
  isGitRepo: boolean
  branch: string | null
}

interface GitStore {
  directories: Map<string, DirectoryGitState>
  // Evicting a project's working set must not blank its repository badge and branch label:
  // only the last known summary is kept, so registered projects beyond the cache limit stay labeled.
  repoSummaries: Map<string, GitRepoSummary>

  activeDirectory: string | null

  setActiveDirectory: (directory: string | null) => void
  removeDirectory: (directory: string) => void
  getDirectoryState: (directory: string) => DirectoryGitState | null

  fetchStatus: (directory: string, git: GitStoreAPI, options?: { silent?: boolean; mode?: "light" }) => Promise<boolean>
  fetchBranches: (directory: string, git: GitStoreAPI) => Promise<void>
  fetchLog: (directory: string, git: GitStoreAPI, maxCount?: number) => Promise<void>
  fetchIdentity: (directory: string, git: GitStoreAPI) => Promise<void>
  fetchAll: (
    directory: string,
    git: GitStoreAPI,
    options?: { force?: boolean; silentIfCached?: boolean },
  ) => Promise<void>

  ensureStatus: (directory: string, git: GitStoreAPI) => Promise<void>
  ensureAll: (directory: string, git: GitStoreAPI) => Promise<void>
  moveStatusPathsOptimistically: (
    directory: string,
    paths: string[],
    direction: "stage" | "unstage",
  ) => GitStatus | null
  restoreStatus: (directory: string, status: GitStatus | null) => void
  bumpIndexRevision: (directory: string) => void

  getDiff: (
    directory: string,
    filePath: string,
  ) => { original: string; modified: string; fetchedAt: number; isBinary?: boolean } | null
  setDiff: (
    directory: string,
    filePath: string,
    diff: { original: string; modified: string; isBinary?: boolean },
  ) => void
  clearDiffCache: (directory: string) => void
  fetchAllDiffs: (directory: string, git: GitStoreAPI) => Promise<void>
  prefetchDiffs: (
    directory: string,
    git: GitStoreAPI,
    filePaths: string[],
    options?: { maxFiles?: number },
  ) => Promise<void>

  setLogMaxCount: (directory: string, maxCount: number) => void

  refresh: (git: GitStoreAPI, options?: { force?: boolean }) => Promise<void>
}

const inFlightDiffFetchesByDirectory = new Map<string, Set<string>>()
const diffFetchGenerationByDirectory = new Map<string, number>()
const inFlightStatusFetches = new Map<string, { promise: Promise<boolean> }>()
const inFlightEnsureAllOwners = new Map<string, object>()
const inFlightEnsureAllByDirectory = new Map<string, Promise<void>>()
const statusFetchRequestIds = new Map<string, number>()
// Status reads whose directory was evicted mid-flight. Their response may only record the
// summary; it must not restore the evicted working set.
const evictedStatusRequestIds = new Map<string, number>()
let statusFetchSequence = 0
// Log, branch and identity reads have the same overlap problem as status: a
// slower earlier response used to overwrite a newer one (a just-created commit
// vanished from history).
const listFetchRequestIds = new Map<string, number>()
let listFetchSequence = 0

const nextListFetchId = (key: string): number => {
  const requestId = ++listFetchSequence
  listFetchRequestIds.set(key, requestId)
  return requestId
}

const isCurrentListFetch = (key: string, requestId: number): boolean =>
  listFetchRequestIds.get(key) === requestId

const getStatusFetchKey = (directory: string, mode: GitStatusFetchMode): string => `${mode}:${directory}`

const getDiffFetchGeneration = (directory: string): number => diffFetchGenerationByDirectory.get(directory) ?? 0

let diffFetchSequence = 0
const bumpDiffFetchGeneration = (directory: string): number => {
  const next = ++diffFetchSequence
  diffFetchGenerationByDirectory.set(directory, next)
  return next
}

const getInFlightDiffs = (directory: string): Set<string> => {
  const existing = inFlightDiffFetchesByDirectory.get(directory)
  if (existing) {
    return existing
  }
  const created = new Set<string>()
  inFlightDiffFetchesByDirectory.set(directory, created)
  return created
}

const forgetDirectoryRequests = (directory: string) => {
  directoryAccessedAt.delete(directory)
  statusFetchRequestIds.delete(directory)
  for (const mode of ["full", "light"] as const) inFlightStatusFetches.delete(getStatusFetchKey(directory, mode))
  for (const kind of ["log", "branches", "identity"]) listFetchRequestIds.delete(`${kind}:${directory}`)
  inFlightEnsureAllByDirectory.delete(directory)
  inFlightEnsureAllOwners.delete(directory)
  inFlightDiffFetchesByDirectory.delete(directory)
  diffFetchGenerationByDirectory.delete(directory)
}

const directoryPayloadBytes = (state: DirectoryGitState): number => {
  let bytes = retainedPayloadSize(state)
  for (const diff of state.diffCache.values()) bytes += retainedPayloadSize(diff)
  return bytes
}

const createEmptyDirectoryState = (): DirectoryGitState => ({
  isGitRepo: null,
  status: null,
  branches: null,
  log: null,
  identity: null,
  diffCache: new Map(),
  indexRevision: 0,
  lastRepoCheckAt: 0,
  lastStatusFetch: 0,
  lastStatusChange: 0,
  lastLogFetch: 0,
  lastBranchesFetch: 0,
  lastIdentityFetch: 0,
  logMaxCount: 25,
  isLoadingStatus: false,
  isLoadingLog: false,
  isLoadingBranches: false,
  isLoadingIdentity: false,
})

// LRU eviction helper for diff cache
const evictDiffCacheIfNeeded = (
  diffCache: Map<string, { original: string; modified: string; fetchedAt: number; isBinary?: boolean }>,
  maxEntries: number = DIFF_CACHE_MAX_ENTRIES,
  maxTotalSize: number = DIFF_CACHE_MAX_TOTAL_SIZE_BYTES,
): Map<string, { original: string; modified: string; fetchedAt: number; isBinary?: boolean }> => {
  // Calculate total size
  let totalSize = 0
  for (const entry of diffCache.values()) {
    totalSize += (entry.original?.length ?? 0) + (entry.modified?.length ?? 0)
  }

  // If within limits, return as-is
  if (diffCache.size <= maxEntries && totalSize <= maxTotalSize) {
    return diffCache
  }

  // Sort entries by fetchedAt (oldest first) for LRU eviction
  const entries = Array.from(diffCache.entries()).sort((a, b) => a[1].fetchedAt - b[1].fetchedAt)

  const newCache = new Map<string, { original: string; modified: string; fetchedAt: number; isBinary?: boolean }>()
  let newTotalSize = 0

  // Keep entries from newest to oldest until limits are reached
  for (let i = entries.length - 1; i >= 0; i--) {
    const [path, entry] = entries[i]
    const entrySize = (entry.original?.length ?? 0) + (entry.modified?.length ?? 0)

    if (newCache.size >= maxEntries) break
    if (newTotalSize + entrySize > maxTotalSize && newCache.size > 0) continue

    newCache.set(path, entry)
    newTotalSize += entrySize
  }

  return newCache
}

const haveDiffStatsChanged = (previous?: GitStatus["diffStats"], next?: GitStatus["diffStats"]): boolean => {
  if (!previous && !next) return false
  if (!previous || !next) return true

  return collectChangedDiffStatPaths(previous, next, new Set()).size > 0
}

const haveRemoteComparisonChanged = (
  previous?: GitStatus["upstreamComparison"],
  next?: GitStatus["upstreamComparison"],
): boolean => {
  if (!previous && !next) return false
  if (!previous || !next) return true

  return (
    previous.remote !== next.remote ||
    previous.branch !== next.branch ||
    previous.ahead !== next.ahead ||
    previous.behind !== next.behind
  )
}

const contentIdentityStamp = (file: {
  headBlobId?: string | null
  indexBlobId?: string | null
  worktreeBlobId?: string | null
}): string | null => {
  if (file.headBlobId === undefined && file.indexBlobId === undefined && file.worktreeBlobId === undefined) return null
  return `${file.headBlobId ?? ""}\0${file.indexBlobId ?? ""}\0${file.worktreeBlobId ?? ""}`
}

const hasStatusChanged = (oldStatus: GitStatus | null, newStatus: GitStatus | null): boolean => {
  if (!oldStatus && !newStatus) return false
  if (!oldStatus || !newStatus) return true

  const oldFiles = oldStatus.files ?? []
  const newFiles = newStatus.files ?? []

  if (oldFiles.length !== newFiles.length) return true
  if (oldStatus.ahead !== newStatus.ahead) return true
  if (oldStatus.behind !== newStatus.behind) return true
  if (oldStatus.current !== newStatus.current) return true
  if (oldStatus.headOid !== newStatus.headOid) return true
  if (oldStatus.tracking !== newStatus.tracking) return true
  if (oldStatus.isClean !== newStatus.isClean) return true
  if (
    newStatus.upstreamComparison !== undefined &&
    haveRemoteComparisonChanged(oldStatus.upstreamComparison, newStatus.upstreamComparison)
  ) {
    return true
  }

  const oldPaths = new Set(oldFiles.map((f) => `${f.path}:${f.index}:${f.working_dir}`))
  const oldByPath = new Map(oldFiles.map((file) => [file.path, file] as const))
  for (const file of newFiles) {
    if (!oldPaths.has(`${file.path}:${file.index}:${file.working_dir}`)) {
      return true
    }
    const nextIdentity = contentIdentityStamp(file)
    if (nextIdentity !== null && contentIdentityStamp(oldByPath.get(file.path) ?? file) !== nextIdentity) {
      return true
    }
  }

  // Skip diffStats comparison when light mode omits them (undefined)
  if (newStatus.diffStats !== undefined && haveDiffStatsChanged(oldStatus.diffStats, newStatus.diffStats)) return true

  return false
}

const getChangedFilePaths = (oldStatus: GitStatus | null, newStatus: GitStatus | null): Set<string> => {
  const changed = new Set<string>()
  if (!newStatus) return changed

  const oldFiles = oldStatus?.files ?? []
  const newFiles = newStatus.files ?? []

  const oldFileMap = new Map(oldFiles.map((f) => [f.path, f] as const))
  const newFileMap = new Map(newFiles.map((f) => [f.path, f] as const))

  const allFilePaths = new Set<string>([...oldFileMap.keys(), ...newFileMap.keys()])
  for (const filePath of allFilePaths) {
    const oldFile = oldFileMap.get(filePath)
    const newFile = newFileMap.get(filePath)

    // Added/removed/renamed
    if (!oldFile || !newFile) {
      changed.add(filePath)
      continue
    }

    // Index/worktree state changed (indicates actual content/state changed)
    if (oldFile.index !== newFile.index || oldFile.working_dir !== newFile.working_dir) {
      changed.add(filePath)
      continue
    }

    // A same-count rewrite keeps the status columns and numstat, but the blob id changes.
    const nextIdentity = contentIdentityStamp(newFile)
    if (nextIdentity !== null && contentIdentityStamp(oldFile) !== nextIdentity) {
      changed.add(filePath)
    }
  }

  // Only compare diffStats when light mode provides them (non-undefined)
  if (newStatus.diffStats !== undefined) {
    collectChangedDiffStatPaths(oldStatus?.diffStats, newStatus.diffStats, changed)
  }

  return changed
}

const hasIndexStatusChanged = (oldStatus: GitStatus | null, newStatus: GitStatus | null): boolean => {
  if (!oldStatus && !newStatus) return false
  if (!oldStatus || !newStatus) return true

  const oldFiles = oldStatus.files ?? []
  const newFiles = newStatus.files ?? []
  const normalizeIndexStatus = (value?: string | null): string => {
    const trimmed = value?.trim() ?? ""
    return trimmed === "?" ? "" : trimmed
  }

  // The index blob id is part of the key: restaging different content can keep the same status letter, and the
  // staged diff on screen must still reload so "viewed" is never set against the old content.
  const indexKey = (file: (typeof oldFiles)[number]): string =>
    `${normalizeIndexStatus(file.index)}:${file.indexBlobId ?? ""}`
  const oldIndexByPath = new Map(oldFiles.map((file) => [file.path, indexKey(file)] as const))
  const newIndexByPath = new Map(newFiles.map((file) => [file.path, indexKey(file)] as const))
  const paths = new Set<string>([...oldIndexByPath.keys(), ...newIndexByPath.keys()])

  for (const path of paths) {
    if ((oldIndexByPath.get(path) ?? "") !== (newIndexByPath.get(path) ?? "")) {
      return true
    }
  }

  return false
}

const isBlankStatusCode = (value?: string | null): boolean => !value || value.trim().length === 0
const isConflictStatusCode = (value?: string | null): boolean => (value || "").trim() === "U"

const toStagedStatusFile = (file: GitStatus["files"][number]): GitStatus["files"][number] => {
  const index = (file.index || "").trim()
  const workingDir = (file.working_dir || "").trim()

  if (isConflictStatusCode(index) || isConflictStatusCode(workingDir)) {
    return file
  }

  const nextIndex = index === "?" || workingDir === "?" ? "A" : index || workingDir || " "

  return {
    ...file,
    index: nextIndex,
    working_dir: " ",
  }
}

const toUnstagedStatusFile = (file: GitStatus["files"][number]): GitStatus["files"][number] => {
  const index = (file.index || "").trim()
  const workingDir = (file.working_dir || "").trim()

  if (isConflictStatusCode(index) || isConflictStatusCode(workingDir)) {
    return file
  }

  const nextWorkingDir = workingDir || (index === "A" || index === "?" ? "?" : index) || " "

  return {
    ...file,
    index: " ",
    working_dir: nextWorkingDir,
  }
}

const isCleanStatusFile = (file: GitStatus["files"][number]): boolean =>
  isBlankStatusCode(file.index) && isBlankStatusCode(file.working_dir)

type GitStateCreator = (set: (patch: Partial<GitStore>) => void, get: () => GitStore) => GitStore

const withDirectoryRetention = (createState: GitStateCreator): GitStateCreator => (rawSet, get) => {
  // Every action writes through this boundary, including late background responses.
  const set = (patch: Partial<GitStore>) => {
    const current = get()
    const active = patch.activeDirectory === undefined ? current.activeDirectory : patch.activeDirectory
    const source = patch.directories ?? current.directories
    const directories = new Map(source)
    const now = Date.now()
    for (const [directory, entry] of source) {
      if (current.directories.get(directory) === entry && directory !== active) continue
      directoryAccessedAt.set(directory, now)
      directories.delete(directory)
      directories.set(directory, entry)
    }
    let bytes = 0
    const sizes = new Map<string, number>()
    for (const [directory, entry] of directories) {
      const size = directoryPayloadBytes(entry)
      sizes.set(directory, size)
      bytes += size
    }
    for (const directory of directories.keys()) {
      if (directory === active) continue
      if (directories.size <= GIT_DIRECTORY_CACHE_LIMIT && bytes <= GIT_DIRECTORY_CACHE_MAX_BYTES &&
        now - (directoryAccessedAt.get(directory) ?? now) < GIT_DIRECTORY_IDLE_TTL_MS) continue
      directories.delete(directory)
      bytes -= sizes.get(directory) ?? 0
      const statusRequestId = statusFetchRequestIds.get(directory)
      forgetDirectoryRequests(directory)
      if (statusRequestId !== undefined) evictedStatusRequestIds.set(directory, statusRequestId)
    }
    for (const directory of current.directories.keys()) {
      if (!directories.has(directory)) forgetDirectoryRequests(directory)
    }
    const baseSummaries = patch.repoSummaries ?? current.repoSummaries ?? new Map<string, GitRepoSummary>()
    let repoSummaries = baseSummaries
    for (const [directory, entry] of directories) {
      // An entry that has not resolved yet keeps the previous summary instead of blanking it.
      if (entry.isGitRepo === null) continue
      const branch = entry.status?.current ?? null
      const previous = repoSummaries.get(directory)
      if (previous?.isGitRepo === entry.isGitRepo && previous.branch === branch) continue
      if (repoSummaries === baseSummaries) repoSummaries = new Map(repoSummaries)
      repoSummaries.set(directory, { isGitRepo: entry.isGitRepo, branch })
    }
    rawSet({ ...patch, directories, repoSummaries })
  }
  return createState(set, get)
}

export const useGitStore = create<GitStore>()(
  devtools(
    withDirectoryRetention((set, get) => ({
      directories: new Map(),
      repoSummaries: new Map(),
      activeDirectory: null,

      setActiveDirectory: (directory) => {
        const { activeDirectory, directories } = get()
        if (activeDirectory === directory) return

        if (activeDirectory) {
          bumpDiffFetchGeneration(activeDirectory)
        }
        if (directory) {
          bumpDiffFetchGeneration(directory)
        }

        // Diff text is the largest per-project payload (the per-directory cache is capped at
        // 20 MB) and only the project on screen needs it: keeping every visited project's cache
        // grew memory without bound. Status/log/branches stay; diffs refetch on demand.
        let prunedDirectories = directories
        if (directories.size > 1) {
          prunedDirectories = new Map(directories)
          for (const [key, entry] of directories) {
            if (key === directory || entry.diffCache.size === 0) continue
            prunedDirectories.set(key, { ...entry, diffCache: new Map() })
          }
        }

        if (directory && !prunedDirectories.has(directory)) {
          const newDirectories = new Map(prunedDirectories)
          newDirectories.set(directory, createEmptyDirectoryState())
          set({ activeDirectory: directory, directories: newDirectories })
        } else {
          set({ activeDirectory: directory, directories: prunedDirectories })
        }
      },

      removeDirectory: (directory) => {
        const directories = new Map(get().directories)
        directories.delete(directory)
        forgetDirectoryRequests(directory)
        evictedStatusRequestIds.delete(directory)
        const repoSummaries = new Map(get().repoSummaries)
        repoSummaries.delete(directory)
        set({ directories, repoSummaries, ...(get().activeDirectory === directory ? { activeDirectory: null } : {}) })
      },

      getDirectoryState: (directory) => {
        return get().directories.get(directory) ?? null
      },

      fetchStatus: async (directory, git, options = {}) => {
        const statusFetchMode: GitStatusFetchMode = options.mode ?? "full"
        const statusFetchKey = getStatusFetchKey(directory, statusFetchMode)
        const existing =
          inFlightStatusFetches.get(statusFetchKey) ??
          (statusFetchMode === "light" ? inFlightStatusFetches.get(getStatusFetchKey(directory, "full")) : undefined)
        if (existing) {
          return existing.promise
        }

        const requestId = ++statusFetchSequence
        statusFetchRequestIds.set(directory, requestId)
        evictedStatusRequestIds.delete(directory)
        const isCurrentStatusFetch = () => statusFetchRequestIds.get(directory) === requestId
        const recordEvictedSummary = (summary: GitRepoSummary) => {
          if (evictedStatusRequestIds.get(directory) !== requestId) return
          evictedStatusRequestIds.delete(directory)
          set({ repoSummaries: new Map(get().repoSummaries).set(directory, summary) })
        }

        const fetchPromise = (async () => {
          const { silent = false } = options
          const { directories } = get()
          let dirState = directories.get(directory)

          if (!dirState) {
            dirState = createEmptyDirectoryState()
          }

          if (!silent) {
            const newDirectories = new Map(get().directories)
            const d = newDirectories.get(directory) ?? createEmptyDirectoryState()
            newDirectories.set(directory, { ...d, isLoadingStatus: true })
            set({ directories: newDirectories })
          }

          let statusChanged = false

          try {
            const now = Date.now()
            const shouldProbeRepository =
              dirState.isGitRepo !== true || now - (dirState.lastRepoCheckAt || 0) > REPO_CHECK_STALE_THRESHOLD

            let isRepo = dirState.isGitRepo === true
            if (shouldProbeRepository) {
              isRepo = await git.checkIsGitRepository(directory)
            }

            if (!isRepo) {
              if (!isCurrentStatusFetch()) {
                recordEvictedSummary({ isGitRepo: false, branch: null })
                return false
              }
              const newDirectories = new Map(get().directories)
              const currentDirState = newDirectories.get(directory) ?? dirState
              newDirectories.set(directory, {
                ...currentDirState,
                isGitRepo: false,
                status: null,
                isLoadingStatus: false,
                lastRepoCheckAt: now,
                lastStatusFetch: now,
              })
              set({ directories: newDirectories })
              return false
            }

            const newStatus = await git.getGitStatus(directory, options.mode ? { mode: options.mode } : undefined)

            if (!isCurrentStatusFetch()) {
              recordEvictedSummary({ isGitRepo: true, branch: newStatus.current ?? null })
              return false
            }

            // Compare against the status the store holds NOW, not the one
            // captured before the awaits: another writer can update the same
            // directory while this fetch is in flight, and the stale capture
            // would then report "no change" and skip dropping the diff-cache
            // entries for paths the live state says changed.
            const liveDirectories = new Map(get().directories)
            const liveDirState = liveDirectories.get(directory) ?? dirState
            if (hasStatusChanged(liveDirState.status, newStatus)) {
              statusChanged = true
              const newDirectories = liveDirectories
              const currentDirState = liveDirState

              const changedPaths = getChangedFilePaths(currentDirState.status, newStatus)
              const indexStatusChanged = hasIndexStatusChanged(currentDirState.status, newStatus)

              const oldPaths = new Set((currentDirState.status?.files ?? []).map((f) => f.path))
              const newPaths = new Set((newStatus.files ?? []).map((f) => f.path))

              const nextDiffCache = new Map(currentDirState.diffCache)

              // Drop cache for removed files
              for (const oldPath of oldPaths) {
                if (!newPaths.has(oldPath)) {
                  nextDiffCache.delete(oldPath)
                }
              }

              // Drop cache for files whose state/content changed
              for (const filePath of changedPaths) {
                nextDiffCache.delete(filePath)
              }

              const hasFileContentChange = changedPaths.size > 0
              if (hasFileContentChange) {
                bumpDiffFetchGeneration(directory)
              }

              // Preserve diffStats from previous status when light mode returns none
              const mergedStatus = {
                ...newStatus,
                diffStats:
                  newStatus.diffStats === undefined && currentDirState.status?.diffStats !== undefined
                    ? currentDirState.status.diffStats
                    : newStatus.diffStats,
                upstreamComparison:
                  newStatus.upstreamComparison === undefined
                    ? currentDirState.status?.upstreamComparison
                    : newStatus.upstreamComparison,
              }

              newDirectories.set(directory, {
                ...currentDirState,
                isGitRepo: true,
                status: mergedStatus,
                diffCache: nextDiffCache,
                indexRevision: indexStatusChanged ? currentDirState.indexRevision + 1 : currentDirState.indexRevision,
                lastRepoCheckAt: shouldProbeRepository ? now : currentDirState.lastRepoCheckAt,
                lastStatusFetch: Date.now(),
                lastStatusChange: hasFileContentChange ? Date.now() : currentDirState.lastStatusChange,
              })
              set({ directories: newDirectories })
            } else {
              const newDirectories = new Map(get().directories)
              const currentDirState = newDirectories.get(directory) ?? createEmptyDirectoryState()
              newDirectories.set(directory, {
                ...currentDirState,
                isGitRepo: true,
                lastRepoCheckAt: shouldProbeRepository ? now : currentDirState.lastRepoCheckAt,
                lastStatusFetch: Date.now(),
                lastStatusChange: currentDirState.lastStatusChange,
              })
              set({ directories: newDirectories })
            }
          } catch (error) {
            console.error("Failed to fetch git status:", error)
          } finally {
            if (!silent && isCurrentStatusFetch()) {
              const newDirectories = new Map(get().directories)
              const d = newDirectories.get(directory) ?? createEmptyDirectoryState()
              newDirectories.set(directory, { ...d, isLoadingStatus: false })
              set({ directories: newDirectories })
            }
          }

          return statusChanged
        })()

        const fetchSlot = { promise: fetchPromise }
        inFlightStatusFetches.set(statusFetchKey, fetchSlot)

        try {
          return await fetchPromise
        } finally {
          if (inFlightStatusFetches.get(statusFetchKey) === fetchSlot) {
            inFlightStatusFetches.delete(statusFetchKey)
          }
          if (isCurrentStatusFetch()) {
            statusFetchRequestIds.delete(directory)
          }
        }
      },

      moveStatusPathsOptimistically: (directory, paths, direction) => {
        const normalizedPaths = new Set(paths.map((path) => path.trim()).filter(Boolean))
        if (normalizedPaths.size === 0) {
          return null
        }

        const { directories } = get()
        const dirState = directories.get(directory)
        const previousStatus = dirState?.status ?? null
        if (!dirState || !previousStatus) {
          return previousStatus
        }

        let didChange = false
        const nextFiles: GitStatus["files"] = []

        for (const file of previousStatus.files) {
          if (!normalizedPaths.has(file.path)) {
            nextFiles.push(file)
            continue
          }

          const nextFile = direction === "stage" ? toStagedStatusFile(file) : toUnstagedStatusFile(file)

          if (nextFile !== file) {
            didChange = true
          }

          if (!isCleanStatusFile(nextFile)) {
            nextFiles.push(nextFile)
          } else {
            didChange = true
          }
        }

        if (!didChange) {
          return previousStatus
        }

        const nextDirectories = new Map(directories)
        nextDirectories.set(directory, {
          ...dirState,
          status: {
            ...previousStatus,
            files: nextFiles,
            isClean: nextFiles.length === 0,
          },
          indexRevision: dirState.indexRevision + 1,
          lastStatusChange: Date.now(),
        })
        set({ directories: nextDirectories })

        return previousStatus
      },

      restoreStatus: (directory, status) => {
        const { directories } = get()
        const dirState = directories.get(directory)
        if (!dirState) {
          return
        }

        const nextDirectories = new Map(directories)
        nextDirectories.set(directory, {
          ...dirState,
          status,
          indexRevision: dirState.indexRevision + 1,
          lastStatusChange: Date.now(),
        })
        set({ directories: nextDirectories })
      },

      bumpIndexRevision: (directory) => {
        const { directories } = get()
        const dirState = directories.get(directory)
        if (!dirState) {
          return
        }

        const nextDirectories = new Map(directories)
        nextDirectories.set(directory, {
          ...dirState,
          indexRevision: dirState.indexRevision + 1,
        })
        set({ directories: nextDirectories })
      },

      fetchBranches: async (directory, git) => {
        {
          const newDirectories = new Map(get().directories)
          const d = newDirectories.get(directory) ?? createEmptyDirectoryState()
          newDirectories.set(directory, { ...d, isLoadingBranches: true })
          set({ directories: newDirectories })
        }

        const requestId = nextListFetchId(`branches:${directory}`)
        try {
          const branches = await git.getGitBranches(directory)
          if (!isCurrentListFetch(`branches:${directory}`, requestId)) return
          const newDirectories = new Map(get().directories)
          const dirState = newDirectories.get(directory) ?? createEmptyDirectoryState()
          newDirectories.set(directory, {
            ...dirState,
            branches,
            isLoadingBranches: false,
            lastBranchesFetch: Date.now(),
          })
          set({ directories: newDirectories })
        } catch (error) {
          console.error("Failed to fetch git branches:", error)
          if (!isCurrentListFetch(`branches:${directory}`, requestId)) return
          const newDirectories = new Map(get().directories)
          const d = newDirectories.get(directory) ?? createEmptyDirectoryState()
          newDirectories.set(directory, { ...d, isLoadingBranches: false })
          set({ directories: newDirectories })
        } finally {
          if (isCurrentListFetch(`branches:${directory}`, requestId)) listFetchRequestIds.delete(`branches:${directory}`)
        }
      },

      fetchLog: async (directory, git, maxCount) => {
        const { directories } = get()
        const dirState = directories.get(directory)
        const effectiveMaxCount = maxCount ?? dirState?.logMaxCount ?? 25

        {
          const newDirectories = new Map(get().directories)
          const d = newDirectories.get(directory) ?? createEmptyDirectoryState()
          newDirectories.set(directory, { ...d, isLoadingLog: true })
          set({ directories: newDirectories })
        }

        const requestId = nextListFetchId(`log:${directory}`)
        try {
          const log = await git.getGitLog(directory, { maxCount: effectiveMaxCount })
          if (!isCurrentListFetch(`log:${directory}`, requestId)) return
          const newDirectories = new Map(get().directories)
          const currentDirState = newDirectories.get(directory) ?? createEmptyDirectoryState()
          newDirectories.set(directory, {
            ...currentDirState,
            log,
            isLoadingLog: false,
            lastLogFetch: Date.now(),
            logMaxCount: effectiveMaxCount,
          })
          set({ directories: newDirectories })
        } catch (error) {
          console.error("Failed to fetch git log:", error)
          if (!isCurrentListFetch(`log:${directory}`, requestId)) return
          const newDirectories = new Map(get().directories)
          const d = newDirectories.get(directory) ?? createEmptyDirectoryState()
          newDirectories.set(directory, { ...d, isLoadingLog: false })
          set({ directories: newDirectories })
        } finally {
          if (isCurrentListFetch(`log:${directory}`, requestId)) listFetchRequestIds.delete(`log:${directory}`)
        }
      },

      fetchIdentity: async (directory, git) => {
        {
          const newDirectories = new Map(get().directories)
          const d = newDirectories.get(directory) ?? createEmptyDirectoryState()
          newDirectories.set(directory, { ...d, isLoadingIdentity: true })
          set({ directories: newDirectories })
        }

        const requestId = nextListFetchId(`identity:${directory}`)
        try {
          const identity = await git.getCurrentGitIdentity(directory)
          if (!isCurrentListFetch(`identity:${directory}`, requestId)) return
          const newDirectories = new Map(get().directories)
          const dirState = newDirectories.get(directory) ?? createEmptyDirectoryState()
          newDirectories.set(directory, {
            ...dirState,
            identity,
            isLoadingIdentity: false,
            lastIdentityFetch: Date.now(),
          })
          set({ directories: newDirectories })
        } catch (error) {
          console.error("Failed to fetch git identity:", error)
          if (!isCurrentListFetch(`identity:${directory}`, requestId)) return
          const newDirectories = new Map(get().directories)
          const d = newDirectories.get(directory) ?? createEmptyDirectoryState()
          newDirectories.set(directory, { ...d, isLoadingIdentity: false })
          set({ directories: newDirectories })
        } finally {
          if (isCurrentListFetch(`identity:${directory}`, requestId)) listFetchRequestIds.delete(`identity:${directory}`)
        }
      },

      fetchAll: async (directory, git, options = {}) => {
        const { directories } = get()
        let dirState = directories.get(directory)

        if (!dirState) {
          dirState = createEmptyDirectoryState()
          const newDirectories = new Map(directories)
          newDirectories.set(directory, dirState)
          set({ directories: newDirectories })
        }

        const { force = false, silentIfCached = false } = options
        const now = Date.now()

        await get().fetchStatus(directory, git, {
          silent: silentIfCached && Boolean(dirState?.status),
        })

        const updatedDirState = get().directories.get(directory)
        if (!updatedDirState?.isGitRepo) return

        await get().fetchBranches(directory, git)

        const logAge = now - (updatedDirState.lastLogFetch || 0)
        if (force || logAge > LOG_STALE_THRESHOLD || !updatedDirState.log) {
          await get().fetchLog(directory, git)
        }

        await get().fetchIdentity(directory, git)

        // Diff prefetch deferred — triggered on-demand when Git tab opens (GitView reactive prefetch)
      },

      getDiff: (directory, filePath) => {
        const dirState = get().directories.get(directory)
        return dirState?.diffCache.get(filePath) ?? null
      },

      setDiff: (directory, filePath, diff) => {
        const newDirectories = new Map(get().directories)
        const dirState = newDirectories.get(directory) ?? createEmptyDirectoryState()
        const newDiffCache = new Map(dirState.diffCache)
        newDiffCache.set(filePath, { ...diff, fetchedAt: Date.now() })
        // Apply LRU eviction to prevent memory bloat
        const evictedCache = evictDiffCacheIfNeeded(newDiffCache)
        newDirectories.set(directory, { ...dirState, diffCache: evictedCache })
        set({ directories: newDirectories })
      },

      clearDiffCache: (directory) => {
        bumpDiffFetchGeneration(directory)
        const newDirectories = new Map(get().directories)
        const dirState = newDirectories.get(directory)
        if (dirState) {
          newDirectories.set(directory, { ...dirState, diffCache: new Map() })
          set({ directories: newDirectories })
        }
      },

      fetchAllDiffs: async (directory, git) => {
        const dirState = get().directories.get(directory)
        if (!dirState?.status?.files || dirState.status.files.length === 0) return

        const limitedFilesToFetch = dirState.status.files.map((file) => file.path).slice(0, DIFF_PREFETCH_MAX_FILES)
        await get().prefetchDiffs(directory, git, limitedFilesToFetch, { maxFiles: DIFF_PREFETCH_MAX_FILES })
      },

      prefetchDiffs: async (directory, git, filePaths, options = {}) => {
        const dirState = get().directories.get(directory)
        if (!dirState?.status?.files || dirState.status.files.length === 0 || filePaths.length === 0) return

        const { maxFiles = DIFF_PREFETCH_FOCUS_MAX_FILES } = options
        const availablePaths = new Set(dirState.status.files.map((file) => file.path))
        const diffStats = dirState.status.diffStats
        const inFlight = getInFlightDiffs(directory)

        const dedupedPaths: string[] = []
        const seen = new Set<string>()
        for (const filePath of filePaths) {
          if (!filePath || seen.has(filePath)) {
            continue
          }
          seen.add(filePath)
          if (!availablePaths.has(filePath)) {
            continue
          }
          if (dirState.diffCache.has(filePath)) {
            continue
          }
          if (inFlight.has(filePath)) {
            continue
          }
          // Skip large files during prefetch — they'll be fetched on-demand when user clicks
          const stats = combinedDiffStatsForPath(diffStats, filePath)
          if (stats.insertions + stats.deletions > DIFF_PREFETCH_LARGE_FILE_THRESHOLD) {
            continue
          }
          dedupedPaths.push(filePath)
        }

        const limitedFilePaths = dedupedPaths.slice(0, Math.max(1, maxFiles))
        if (limitedFilePaths.length === 0) return

        const generation = getDiffFetchGeneration(directory) || bumpDiffFetchGeneration(directory)

        if (typeof document !== "undefined" && document.hidden) {
          return
        }

        limitedFilePaths.forEach((path) => inFlight.add(path))

        let nextIndex = 0
        const results: Array<{ path: string; diff: { original: string; modified: string; isBinary?: boolean } }> = []

        const takeNext = () => {
          const current = nextIndex
          nextIndex += 1
          return current < limitedFilePaths.length ? limitedFilePaths[current] : null
        }

        const fetchWithTimeout = async (filePath: string) => {
          const fetchPromise = git.getGitFileDiff(directory, { path: filePath })
          let timeoutHandle: ReturnType<typeof setTimeout> | undefined
          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(
              () => reject(new Error(`Timed out after ${DIFF_PREFETCH_TIMEOUT_MS}ms`)),
              DIFF_PREFETCH_TIMEOUT_MS,
            )
          })
          try {
            const response = await Promise.race([fetchPromise, timeoutPromise])
            return {
              path: filePath,
              diff: {
                original: response.original ?? "",
                modified: response.modified ?? "",
                isBinary: response.isBinary,
              },
            }
          } finally {
            if (timeoutHandle !== undefined) clearTimeout(timeoutHandle)
          }
        }

        const worker = async () => {
          for (;;) {
            if (generation !== getDiffFetchGeneration(directory)) {
              return
            }
            const next = takeNext()
            if (!next) return
            try {
              results.push(await fetchWithTimeout(next))
            } catch {
              // Ignore individual failures/timeouts during prefetch.
            } finally {
              inFlight.delete(next)
            }
          }
        }

        const workerCount = Math.min(DIFF_PREFETCH_CONCURRENCY, limitedFilePaths.length)
        await Promise.allSettled(Array.from({ length: workerCount }, () => worker()))

        limitedFilePaths.forEach((path) => inFlight.delete(path))

        if (generation !== getDiffFetchGeneration(directory)) {
          return
        }

        // Update diff cache with results
        const newDirectories = new Map(get().directories)
        const currentDirState = newDirectories.get(directory)
        if (!currentDirState) return

        const newDiffCache = new Map(currentDirState.diffCache)
        const now = Date.now()

        results.forEach((result) => {
          newDiffCache.set(result.path, {
            ...result.diff,
            fetchedAt: now,
          })
        })

        // Apply LRU eviction to prevent memory bloat
        const evictedCache = evictDiffCacheIfNeeded(newDiffCache)
        newDirectories.set(directory, { ...currentDirState, diffCache: evictedCache })
        set({ directories: newDirectories })
      },

      setLogMaxCount: (directory, maxCount) => {
        const newDirectories = new Map(get().directories)
        const dirState = newDirectories.get(directory) ?? createEmptyDirectoryState()
        newDirectories.set(directory, { ...dirState, logMaxCount: maxCount })
        set({ directories: newDirectories })
      },

      ensureStatus: async (directory, git) => {
        const dirState = get().directories.get(directory)
        const now = Date.now()
        if (dirState?.status && now - dirState.lastStatusFetch < STATUS_STALE_THRESHOLD) {
          return
        }
        await get().fetchStatus(directory, git, { silent: Boolean(dirState?.status) })
      },

      ensureAll: (directory, git) => {
        const existing = inFlightEnsureAllByDirectory.get(directory)
        if (existing) return existing

        const owner = {}
        inFlightEnsureAllOwners.set(directory, owner)
        const promise = (async () => {
          const dirState = get().directories.get(directory)
          const now = Date.now()
          const needsFullStatus = !dirState?.status || dirState.status.diffStats === undefined

          if (needsFullStatus || now - (dirState?.lastStatusFetch ?? 0) >= STATUS_STALE_THRESHOLD) {
            await get().fetchStatus(directory, git, { silent: Boolean(dirState?.status) })
          }

          if (inFlightEnsureAllOwners.get(directory) !== owner) return
          const updatedState = get().directories.get(directory)
          if (!updatedState?.isGitRepo) return

          const fetches: Promise<void>[] = []

          if (!updatedState.branches || now - updatedState.lastBranchesFetch >= BRANCHES_STALE_THRESHOLD) {
            fetches.push(get().fetchBranches(directory, git))
          }
          if (!updatedState.log || now - updatedState.lastLogFetch >= LOG_STALE_THRESHOLD) {
            fetches.push(get().fetchLog(directory, git))
          }
          if (!updatedState.identity || now - updatedState.lastIdentityFetch >= IDENTITY_STALE_THRESHOLD) {
            fetches.push(get().fetchIdentity(directory, git))
          }

          if (fetches.length > 0) await Promise.all(fetches)
        })()

        inFlightEnsureAllByDirectory.set(directory, promise)
        promise.finally(() => {
          if (inFlightEnsureAllByDirectory.get(directory) === promise) {
            inFlightEnsureAllByDirectory.delete(directory)
            inFlightEnsureAllOwners.delete(directory)
          }
        })

        return promise
      },

      refresh: async (git, options = {}) => {
        const { activeDirectory } = get()
        if (!activeDirectory) return
        await get().fetchAll(activeDirectory, git, options)
      },
    })),
    { name: "git-store" },
  ),
)

export const useGitStatus = (directory: string | null) => {
  return useGitStore((state) => {
    if (!directory) return null
    return state.directories.get(directory)?.status ?? null
  })
}

export const useGitBranches = (directory: string | null) => {
  return useGitStore((state) => {
    if (!directory) return null
    return state.directories.get(directory)?.branches ?? null
  })
}

export const useGitLog = (directory: string | null) => {
  return useGitStore((state) => {
    if (!directory) return null
    return state.directories.get(directory)?.log ?? null
  })
}

export const useGitIdentity = (directory: string | null) => {
  return useGitStore((state) => {
    if (!directory) return null
    return state.directories.get(directory)?.identity ?? null
  })
}

// A live entry wins once it has resolved; an evicted or still-loading one falls back to the
// last known summary.
const readRepoSummary = (state: GitStore, directory: string): GitRepoSummary | null => {
  const entry = state.directories.get(directory)
  if (entry && entry.isGitRepo !== null) return { isGitRepo: entry.isGitRepo, branch: entry.status?.current ?? null }
  return state.repoSummaries.get(directory) ?? null
}

export const useIsGitRepo = (directory: string | null) => {
  return useGitStore((state) => {
    if (!directory) return null
    return readRepoSummary(state, directory)?.isGitRepo ?? null
  })
}
export const useGitBranchLabel = (directory: string | null) => {
  return useGitStore((state) => {
    if (!directory) return null
    return readRepoSummary(state, directory)?.branch?.trim() ?? null
  })
}

const allBranchesCacheRef = { current: new Map<string, string | null>() }

export const useGitAllBranches = () => {
  return useGitStore((state) => {
    const prev = allBranchesCacheRef.current
    const directories = new Set([...state.directories.keys(), ...state.repoSummaries.keys()])
    let same = prev.size === directories.size
    if (same) {
      for (const dir of directories) {
        if (!prev.has(dir) || prev.get(dir) !== (readRepoSummary(state, dir)?.branch ?? null)) {
          same = false
          break
        }
      }
    }
    if (same) return prev
    const result = new Map<string, string | null>()
    for (const dir of directories) {
      result.set(dir, readRepoSummary(state, dir)?.branch ?? null)
    }
    allBranchesCacheRef.current = result
    return result
  })
}
export const useGitRepoStatusMap = (directories: string[]) => {
  const cacheRef = React.useRef<Map<string, { isGitRepo: boolean | null; branch: string | null }>>(new Map())
  return useGitStore((state) => {
    const prev = cacheRef.current
    let same = prev.size === directories.length
    if (same) {
      for (const dir of directories) {
        const summary = readRepoSummary(state, dir)
        const pv = prev.get(dir)
        if (!pv || (summary?.isGitRepo ?? null) !== pv.isGitRepo || (summary?.branch ?? null) !== pv.branch) {
          same = false
          break
        }
      }
    }
    if (same) return prev
    const result = new Map<string, { isGitRepo: boolean | null; branch: string | null }>()
    for (const dir of directories) {
      const summary = readRepoSummary(state, dir)
      result.set(dir, { isGitRepo: summary?.isGitRepo ?? null, branch: summary?.branch ?? null })
    }
    cacheRef.current = result
    return result
  })
}

export const useGitLoadingStatus = (directory: string | null) => {
  return useGitStore((state) => {
    if (!directory) return false
    return state.directories.get(directory)?.isLoadingStatus ?? false
  })
}

export const useGitLoadingLog = (directory: string | null) => {
  return useGitStore((state) => {
    if (!directory) return false
    return state.directories.get(directory)?.isLoadingLog ?? false
  })
}

export const useGitLoadingBranches = (directory: string | null) => {
  return useGitStore((state) => {
    if (!directory) return false
    return state.directories.get(directory)?.isLoadingBranches ?? false
  })
}
