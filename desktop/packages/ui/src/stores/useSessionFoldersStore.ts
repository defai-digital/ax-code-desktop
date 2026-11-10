import { create } from "zustand"
import { devtools } from "zustand/middleware"
import { getSafeStorage } from "./utils/safeStorage"
import { API_ENDPOINTS } from "@/lib/http"

// --- Types ---

export interface SessionFolder {
  id: string
  name: string
  sessionIds: string[]
  createdAt: number
  /** If set, this folder is a sub-folder of the parent folder with this id */
  parentId?: string | null
}

export type SessionFoldersMap = Record<string, SessionFolder[]>

/** The part of the store the disk file holds. */
export interface SessionFoldersSnapshot {
  foldersMap: SessionFoldersMap
  collapsedFolderIds: string[]
}

interface SessionFoldersState {
  foldersMap: SessionFoldersMap
  collapsedFolderIds: Set<string>
}

interface SessionFoldersActions {
  getFoldersForScope: (scopeKey: string) => SessionFolder[]
  createFolder: (scopeKey: string, name: string, parentId?: string | null) => SessionFolder
  renameFolder: (scopeKey: string, folderId: string, name: string) => void
  deleteFolder: (scopeKey: string, folderId: string) => void
  addSessionToFolder: (scopeKey: string, folderId: string, sessionId: string) => void
  addSessionsToFolder: (scopeKey: string, folderId: string, sessionIds: string[]) => void
  removeSessionFromFolder: (scopeKey: string, sessionId: string) => void
  removeSessionsFromFolders: (scopeKey: string, sessionIds: string[]) => void
  toggleFolderCollapse: (folderId: string) => void
  cleanupSessions: (scopeKey: string, existingSessionIds: Set<string>) => void
  getSessionFolderId: (scopeKey: string, sessionId: string) => string | null
}

type SessionFoldersStore = SessionFoldersState & SessionFoldersActions

// --- Storage ---

const FOLDERS_STORAGE_KEY = "oc.sessions.folders"
const COLLAPSED_STORAGE_KEY = "oc.sessions.folderCollapse"
const SESSION_FOLDERS_API_PATH = API_ENDPOINTS.sessionFolders
const DISK_WRITE_DEBOUNCE_MS = 250
const ARCHIVED_SCOPE_PREFIX = "__archived__:"

const safeStorage = getSafeStorage()
let diskWriteTimer: ReturnType<typeof setTimeout> | null = null
/** Body of the disk write still sitting in the debounce window. */
let pendingDiskWriteBody: string | null = null
let diskHydrated = false
let diskHydrationInFlight = false
let persistFoldersTimer: ReturnType<typeof setTimeout> | undefined
let persistCollapsedTimer: ReturnType<typeof setTimeout> | undefined
let pendingFoldersMap: SessionFoldersMap | null = null
let pendingCollapsedIds: Set<string> | null = null
// Set by every store mutation (via persistState). Guards the disk hydration
// GET below from clobbering a folder the user creates/edits in the brief
// window between store init (localStorage snapshot) and that fetch
// resolving — without this, a fast local edit is silently reverted to the
// stale disk snapshot.
let hasLocalFoldersMutation = false

const cloneSessionFoldersMap = (foldersMap: SessionFoldersMap): SessionFoldersMap =>
  Object.fromEntries(
    Object.entries(foldersMap).map(([scopeKey, folders]) => [
      scopeKey,
      folders.map((folder) => ({
        ...folder,
        sessionIds: [...folder.sessionIds],
      })),
    ]),
  )

const toStringSet = (values: readonly unknown[]): Set<string> =>
  new Set(values.filter((value): value is string => typeof value === "string"))

const toNonEmptyStringSet = (values: readonly unknown[]): Set<string> =>
  new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))

const toSessionIdSet = (sessionIds: readonly unknown[]): Set<string> => toNonEmptyStringSet(sessionIds)

const sameFolder = (a: SessionFolder | undefined, b: SessionFolder | undefined): boolean => {
  if (!a || !b) return a === b
  return (
    a.name === b.name &&
    a.createdAt === b.createdAt &&
    (a.parentId ?? null) === (b.parentId ?? null) &&
    a.sessionIds.length === b.sessionIds.length &&
    a.sessionIds.every((sessionId, index) => sessionId === b.sessionIds[index])
  )
}

/**
 * Three-way merge of the folder state after the server refused a write (409): `base` is what this window last
 * read from or wrote to disk, `local` is this window now, `remote` is the file now. A folder this window changed
 * (created, edited or deleted) since `base` takes this window's version; any other folder takes the file's, so
 * another window's rename, creation or deletion is kept. Collapsed ids follow the same rule per id.
 */
export const mergeSessionFolderSnapshots = (
  base: SessionFoldersSnapshot,
  local: SessionFoldersSnapshot,
  remote: SessionFoldersSnapshot,
): SessionFoldersSnapshot => {
  const foldersMap: SessionFoldersMap = {}
  const scopeKeys = new Set([
    ...Object.keys(remote.foldersMap),
    ...Object.keys(local.foldersMap),
    ...Object.keys(base.foldersMap),
  ])
  for (const scopeKey of scopeKeys) {
    const byId = (folders: SessionFolder[] | undefined) => new Map((folders ?? []).map((folder) => [folder.id, folder]))
    const baseById = byId(base.foldersMap[scopeKey])
    const localById = byId(local.foldersMap[scopeKey])
    const remoteById = byId(remote.foldersMap[scopeKey])
    const orderedIds = [...remoteById.keys()]
    for (const id of localById.keys()) {
      if (!remoteById.has(id)) orderedIds.push(id)
    }
    const merged: SessionFolder[] = []
    const fromLocal = new Set<string>()
    for (const id of orderedIds) {
      const localChanged = !sameFolder(baseById.get(id), localById.get(id))
      const folder = localChanged ? localById.get(id) : remoteById.get(id)
      if (!folder) continue
      if (localChanged) fromLocal.add(id)
      merged.push({ ...folder, sessionIds: [...folder.sessionIds] })
    }
    // A session belongs to one folder. If this window and another each moved it, this window's move wins.
    const owner = new Map<string, string>()
    for (const folder of merged) {
      for (const sessionId of folder.sessionIds) {
        const current = owner.get(sessionId)
        if (!current || (fromLocal.has(folder.id) && !fromLocal.has(current))) owner.set(sessionId, folder.id)
      }
    }
    const mergedIds = new Set(merged.map((folder) => folder.id))
    const folders = merged.map((folder) => ({
      ...folder,
      sessionIds: folder.sessionIds.filter((sessionId) => owner.get(sessionId) === folder.id),
      // A sub-folder whose parent the other side deleted stays, at the top level.
      parentId: folder.parentId && mergedIds.has(folder.parentId) ? folder.parentId : null,
    }))
    if (folders.length > 0) foldersMap[scopeKey] = folders
  }

  const baseCollapsed = new Set(base.collapsedFolderIds)
  const localCollapsed = new Set(local.collapsedFolderIds)
  const remoteCollapsed = new Set(remote.collapsedFolderIds)
  const existingIds = new Set(Object.values(foldersMap).flatMap((folders) => folders.map((folder) => folder.id)))
  const collapsedFolderIds = [...new Set([...remoteCollapsed, ...localCollapsed, ...baseCollapsed])].filter((id) => {
    if (!existingIds.has(id)) return false
    return localCollapsed.has(id) !== baseCollapsed.has(id) ? localCollapsed.has(id) : remoteCollapsed.has(id)
  })
  return { foldersMap, collapsedFolderIds }
}

const MAX_DISK_WRITE_CONFLICTS = 3
const MAX_DISK_WRITE_RETRIES = 3
/** The file revision this window last read or wrote; null until disk hydration has answered. */
let diskRevision: number | null = null
/** The folder state at `diskRevision`, the base of the three-way merge after a 409. */
let diskSyncedSnapshot: SessionFoldersSnapshot | null = null
let diskWriteInFlight = false
let diskWriteRequested = false
let diskWriteRetries = 0
let diskWriteRetryTimer: ReturnType<typeof setTimeout> | null = null

const readRevision = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null

const snapshotFromDisk = (value: { foldersMap?: unknown; collapsedFolderIds?: unknown }): SessionFoldersSnapshot => ({
  foldersMap: normalizeFoldersMap(value.foldersMap),
  collapsedFolderIds: Array.isArray(value.collapsedFolderIds)
    ? Array.from(toStringSet(value.collapsedFolderIds))
    : [],
})

const readStoreSnapshot = (): SessionFoldersSnapshot => {
  const state = useSessionFoldersStore.getState()
  return {
    foldersMap: cloneSessionFoldersMap(state.foldersMap),
    collapsedFolderIds: Array.from(state.collapsedFolderIds),
  }
}

/** Puts a merged state into the store and localStorage without scheduling another disk write. */
const applyMergedSnapshot = (snapshot: SessionFoldersSnapshot): void => {
  const collapsed = new Set(snapshot.collapsedFolderIds)
  useSessionFoldersStore.setState({ foldersMap: snapshot.foldersMap, collapsedFolderIds: collapsed })
  persistFolders(snapshot.foldersMap)
  persistCollapsed(collapsed)
}

const scheduleDiskWriteRetry = (): void => {
  if (diskWriteRetryTimer || diskWriteRetries >= MAX_DISK_WRITE_RETRIES) return
  diskWriteRetries += 1
  diskWriteRetryTimer = setTimeout(() => {
    diskWriteRetryTimer = null
    void writeSessionFoldersToDisk()
  }, 2_000 * diskWriteRetries)
}

const postSessionFolders = async (snapshot: SessionFoldersSnapshot, baseRevision: number | null) => {
  const body: Record<string, unknown> = { version: 1, ...snapshot, updatedAt: Date.now() }
  if (baseRevision !== null) body.baseRevision = baseRevision
  return fetch(SESSION_FOLDERS_API_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

/**
 * Writes the store's current state, one request at a time. A 409 means another window saved first: merge this
 * window's changes into the file's state and write again. A failed write used to be dropped silently, leaving
 * the disk behind localStorage; it is retried a few times.
 */
const writeSessionFoldersToDisk = async (): Promise<void> => {
  if (diskWriteInFlight) {
    diskWriteRequested = true
    return
  }
  diskWriteInFlight = true
  try {
    for (let conflicts = 0; ; ) {
      diskWriteRequested = false
      const snapshot = readStoreSnapshot()
      const baseRevision = diskRevision
      const response = await postSessionFolders(snapshot, baseRevision)
      if (response.ok) {
        const result = (await response.json().catch(() => null)) as { revision?: unknown } | null
        const revision = readRevision(result?.revision)
        // Only a write sent with a revision leaves the file equal to this snapshot. One sent before hydration
        // was merged with folders this window has not seen, so it is not a base to merge against.
        if (revision !== null && baseRevision !== null) {
          diskRevision = revision
          diskSyncedSnapshot = snapshot
        }
        diskWriteRetries = 0
        if (!diskWriteRequested) return
        continue
      }
      if (response.status === 409 && conflicts < MAX_DISK_WRITE_CONFLICTS) {
        conflicts += 1
        const result = (await response.json().catch(() => null)) as {
          current?: { foldersMap?: unknown; collapsedFolderIds?: unknown; revision?: unknown }
        } | null
        const revision = readRevision(result?.current?.revision)
        if (!result?.current || revision === null) {
          scheduleDiskWriteRetry()
          return
        }
        const remote = snapshotFromDisk(result.current)
        const base = diskSyncedSnapshot ?? { foldersMap: {}, collapsedFolderIds: [] }
        applyMergedSnapshot(mergeSessionFolderSnapshots(base, readStoreSnapshot(), remote))
        diskRevision = revision
        diskSyncedSnapshot = remote
        continue
      }
      scheduleDiskWriteRetry()
      return
    }
  } catch {
    scheduleDiskWriteRetry()
  } finally {
    diskWriteInFlight = false
  }
}

/** The unload flush: keepalive cannot read a 409, so it is sent without a revision and the server merges it. */
const sendSessionFoldersToDiskOnUnload = (body: string): void => {
  try {
    void fetch(SESSION_FOLDERS_API_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* best-effort */
  }
}

const schedulePersistToDisk = (foldersMap: SessionFoldersMap, collapsedFolderIds: Set<string>): void => {
  if (typeof window === "undefined") {
    return
  }

  if (diskWriteTimer) {
    clearTimeout(diskWriteTimer)
  }

  const foldersSnapshot = cloneSessionFoldersMap(foldersMap)
  const collapsedSnapshot = Array.from(collapsedFolderIds)

  const body = JSON.stringify({
    version: 1,
    foldersMap: foldersSnapshot,
    collapsedFolderIds: collapsedSnapshot,
    updatedAt: Date.now(),
  })
  pendingDiskWriteBody = body

  diskWriteTimer = setTimeout(() => {
    diskWriteTimer = null
    pendingDiskWriteBody = null
    void writeSessionFoldersToDisk()
  }, DISK_WRITE_DEBOUNCE_MS)
}

/**
 * Every folder map this store accepts, whoever wrote it.
 *
 * The localStorage path validated each scope and each entry; the disk path took whatever the response held
 * as long as it was an object, so `{"foldersMap": {"/p": "oops"}}` — a hand edit, or a file an older writer
 * produced — reached the store and `getFoldersForScope` handed a string to callers that map over it.
 */
const normalizeFoldersMap = (value: unknown): SessionFoldersMap => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  const result: SessionFoldersMap = {}
  for (const [scopeKey, entries] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(entries)) {
      continue
    }
    const folders: SessionFolder[] = []
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") continue
      const candidate = entry as Record<string, unknown>
      const id = typeof candidate.id === "string" ? candidate.id.trim() : ""
      const name = typeof candidate.name === "string" ? candidate.name.trim() : ""
      if (!id || !name) continue
      const createdAt = typeof candidate.createdAt === "number" ? candidate.createdAt : 0
      const sessionIds = Array.isArray(candidate.sessionIds)
        ? (candidate.sessionIds as unknown[]).filter((v): v is string => typeof v === "string" && v.trim().length > 0)
        : []
      const parentId = typeof candidate.parentId === "string" ? candidate.parentId : null
      folders.push({ id, name, sessionIds, createdAt, parentId })
    }
    if (folders.length > 0) {
      result[scopeKey] = folders
    }
  }
  return result
}

const readPersistedFolders = (): SessionFoldersMap => {
  try {
    const raw = safeStorage.getItem(FOLDERS_STORAGE_KEY)
    if (!raw) {
      return {}
    }
    return normalizeFoldersMap(JSON.parse(raw))
  } catch {
    return {}
  }
}

const readPersistedCollapsed = (): Set<string> => {
  try {
    const raw = safeStorage.getItem(COLLAPSED_STORAGE_KEY)
    if (!raw) {
      return new Set()
    }
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return new Set()
    }
    return toStringSet(parsed)
  } catch {
    return new Set()
  }
}

const persistFolders = (foldersMap: SessionFoldersMap): void => {
  pendingFoldersMap = foldersMap
  clearTimeout(persistFoldersTimer)
  persistFoldersTimer = setTimeout(() => {
    try {
      safeStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(foldersMap))
      pendingFoldersMap = null
    } catch {
      // ignored
    }
  }, 300)
}

const persistCollapsed = (collapsedFolderIds: Set<string>): void => {
  pendingCollapsedIds = collapsedFolderIds
  clearTimeout(persistCollapsedTimer)
  persistCollapsedTimer = setTimeout(() => {
    try {
      safeStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(Array.from(collapsedFolderIds)))
      pendingCollapsedIds = null
    } catch {
      // ignored
    }
  }, 300)
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    if (pendingFoldersMap !== null) {
      clearTimeout(persistFoldersTimer)
      try {
        safeStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(pendingFoldersMap))
      } catch {
        /* ignored */
      }
      pendingFoldersMap = null
    }
    if (pendingCollapsedIds !== null) {
      clearTimeout(persistCollapsedTimer)
      try {
        safeStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(Array.from(pendingCollapsedIds)))
      } catch {
        /* ignored */
      }
      pendingCollapsedIds = null
    }
    // Send the disk write the debounce window was still holding. Without this the
    // disk copy lags localStorage, and the next launch's disk hydration overwrites
    // the newer local state (a folder created just before quitting disappears).
    if (pendingDiskWriteBody !== null) {
      if (diskWriteTimer) {
        clearTimeout(diskWriteTimer)
        diskWriteTimer = null
      }
      const body = pendingDiskWriteBody
      pendingDiskWriteBody = null
      sendSessionFoldersToDiskOnUnload(body)
    }
  })
}

const persistState = (foldersMap: SessionFoldersMap, collapsedFolderIds: Set<string>): void => {
  hasLocalFoldersMutation = true
  persistFolders(foldersMap)
  persistCollapsed(collapsedFolderIds)
  schedulePersistToDisk(foldersMap, collapsedFolderIds)
}

const createFolderId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `folder_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

const syncCollapsedAfterFolderCleanup = (
  prevFolders: SessionFolder[],
  nextFolders: SessionFolder[],
  collapsedFolderIds: Set<string>,
): Set<string> | null => {
  const nextFolderIds = new Set(nextFolders.map((folder) => folder.id))
  let nextCollapsed: Set<string> | null = null

  for (const folder of prevFolders) {
    if (!nextFolderIds.has(folder.id) && collapsedFolderIds.has(folder.id)) {
      if (!nextCollapsed) {
        nextCollapsed = new Set(collapsedFolderIds)
      }
      nextCollapsed.delete(folder.id)
    }
  }

  return nextCollapsed
}

const pruneEmptyArchivedFolders = (scopeKey: string, folders: SessionFolder[]): SessionFolder[] => {
  if (!scopeKey.startsWith(ARCHIVED_SCOPE_PREFIX)) {
    return folders
  }

  return folders.filter((folder) => folder.sessionIds.length > 0)
}

// --- Store ---

export const useSessionFoldersStore = create<SessionFoldersStore>()(
  devtools(
    (set, get) => ({
      foldersMap: readPersistedFolders(),
      collapsedFolderIds: readPersistedCollapsed(),

      getFoldersForScope: (scopeKey: string): SessionFolder[] => {
        if (!scopeKey) return []
        return get().foldersMap[scopeKey] ?? []
      },

      createFolder: (scopeKey: string, name: string, parentId?: string | null): SessionFolder => {
        const trimmed = name.trim() || "New folder"
        const folder: SessionFolder = {
          id: createFolderId(),
          name: trimmed,
          sessionIds: [],
          createdAt: Date.now(),
          parentId: parentId ?? null,
        }
        const current = get().foldersMap
        const scopeFolders = current[scopeKey] ?? []
        const nextMap: SessionFoldersMap = {
          ...current,
          [scopeKey]: [...scopeFolders, folder],
        }
        set({ foldersMap: nextMap })
        persistState(nextMap, get().collapsedFolderIds)
        return folder
      },

      renameFolder: (scopeKey: string, folderId: string, name: string): void => {
        const trimmed = name.trim()
        if (!trimmed || !scopeKey) return
        const current = get().foldersMap
        const scopeFolders = current[scopeKey]
        if (!scopeFolders) return
        const nextFolders = scopeFolders.map((folder) =>
          folder.id === folderId ? { ...folder, name: trimmed } : folder,
        )
        const nextMap: SessionFoldersMap = { ...current, [scopeKey]: nextFolders }
        set({ foldersMap: nextMap })
        persistState(nextMap, get().collapsedFolderIds)
      },

      deleteFolder: (scopeKey: string, folderId: string): void => {
        if (!scopeKey) return
        const current = get().foldersMap
        const scopeFolders = current[scopeKey]
        if (!scopeFolders) return
        // Also delete all sub-folders of this folder
        const idsToDelete = new Set<string>([folderId])
        let changed = true
        while (changed) {
          changed = false
          for (const f of scopeFolders) {
            if (f.parentId && idsToDelete.has(f.parentId) && !idsToDelete.has(f.id)) {
              idsToDelete.add(f.id)
              changed = true
            }
          }
        }
        const nextFolders = scopeFolders.filter((folder) => !idsToDelete.has(folder.id))
        const nextMap: SessionFoldersMap = { ...current, [scopeKey]: nextFolders }
        set({ foldersMap: nextMap })
        persistState(nextMap, get().collapsedFolderIds)

        // Clean up collapsed state for all deleted folders
        const collapsed = get().collapsedFolderIds
        const hasStale = Array.from(idsToDelete).some((id) => collapsed.has(id))
        if (hasStale) {
          const nextCollapsed = new Set(collapsed)
          idsToDelete.forEach((id) => nextCollapsed.delete(id))
          set({ collapsedFolderIds: nextCollapsed })
          persistState(nextMap, nextCollapsed)
        }
      },

      addSessionToFolder: (scopeKey: string, folderId: string, sessionId: string): void => {
        if (!scopeKey || !folderId || !sessionId) return
        const current = get().foldersMap
        const scopeFolders = current[scopeKey]
        if (!scopeFolders) return

        // Remove session from any existing folder first, then add to target
        const nextFolders = scopeFolders.map((folder) => {
          const withoutSession = folder.sessionIds.filter((id) => id !== sessionId)
          if (folder.id === folderId) {
            return { ...folder, sessionIds: [...withoutSession, sessionId] }
          }
          if (withoutSession.length !== folder.sessionIds.length) {
            return { ...folder, sessionIds: withoutSession }
          }
          return folder
        })

        const nextMap: SessionFoldersMap = { ...current, [scopeKey]: nextFolders }
        const nextCollapsed = syncCollapsedAfterFolderCleanup(scopeFolders, nextFolders, get().collapsedFolderIds)

        set(nextCollapsed ? { foldersMap: nextMap, collapsedFolderIds: nextCollapsed } : { foldersMap: nextMap })
        persistState(nextMap, nextCollapsed ?? get().collapsedFolderIds)
      },

      addSessionsToFolder: (scopeKey: string, folderId: string, sessionIds: string[]): void => {
        if (!scopeKey || !folderId || sessionIds.length === 0) return
        const current = get().foldersMap
        const scopeFolders = current[scopeKey]
        if (!scopeFolders) return

        const idSet = toSessionIdSet(sessionIds)
        if (idSet.size === 0) return

        const nextFolders = scopeFolders.map((folder) => {
          const withoutSessions = folder.sessionIds.filter((id) => !idSet.has(id))
          if (folder.id === folderId) {
            return { ...folder, sessionIds: [...withoutSessions, ...idSet] }
          }
          if (withoutSessions.length !== folder.sessionIds.length) {
            return { ...folder, sessionIds: withoutSessions }
          }
          return folder
        })

        const nextMap: SessionFoldersMap = { ...current, [scopeKey]: nextFolders }
        const nextCollapsed = syncCollapsedAfterFolderCleanup(scopeFolders, nextFolders, get().collapsedFolderIds)

        set(nextCollapsed ? { foldersMap: nextMap, collapsedFolderIds: nextCollapsed } : { foldersMap: nextMap })
        persistState(nextMap, nextCollapsed ?? get().collapsedFolderIds)
      },

      removeSessionsFromFolders: (scopeKey: string, sessionIds: string[]): void => {
        if (!scopeKey || sessionIds.length === 0) return
        const current = get().foldersMap
        const scopeFolders = current[scopeKey]
        if (!scopeFolders) return

        const idSet = toSessionIdSet(sessionIds)
        if (idSet.size === 0) return

        let changed = false
        const nextFolders = scopeFolders.map((folder) => {
          const filtered = folder.sessionIds.filter((id) => !idSet.has(id))
          if (filtered.length !== folder.sessionIds.length) {
            changed = true
            return { ...folder, sessionIds: filtered }
          }
          return folder
        })

        if (!changed) return
        const nextMap: SessionFoldersMap = { ...current, [scopeKey]: nextFolders }
        const nextCollapsed = syncCollapsedAfterFolderCleanup(scopeFolders, nextFolders, get().collapsedFolderIds)

        set(nextCollapsed ? { foldersMap: nextMap, collapsedFolderIds: nextCollapsed } : { foldersMap: nextMap })
        persistState(nextMap, nextCollapsed ?? get().collapsedFolderIds)
      },

      removeSessionFromFolder: (scopeKey: string, sessionId: string): void => {
        if (!scopeKey || !sessionId) return
        const current = get().foldersMap
        const scopeFolders = current[scopeKey]
        if (!scopeFolders) return

        let changed = false
        const nextFolders = scopeFolders.map((folder) => {
          const filtered = folder.sessionIds.filter((id) => id !== sessionId)
          if (filtered.length !== folder.sessionIds.length) {
            changed = true
            return { ...folder, sessionIds: filtered }
          }
          return folder
        })

        if (!changed) return
        const nextMap: SessionFoldersMap = { ...current, [scopeKey]: nextFolders }
        const nextCollapsed = syncCollapsedAfterFolderCleanup(scopeFolders, nextFolders, get().collapsedFolderIds)

        set(nextCollapsed ? { foldersMap: nextMap, collapsedFolderIds: nextCollapsed } : { foldersMap: nextMap })
        persistState(nextMap, nextCollapsed ?? get().collapsedFolderIds)
      },

      toggleFolderCollapse: (folderId: string): void => {
        const collapsed = get().collapsedFolderIds
        const next = new Set(collapsed)
        if (next.has(folderId)) {
          next.delete(folderId)
        } else {
          next.add(folderId)
        }
        set({ collapsedFolderIds: next })
        persistState(get().foldersMap, next)
      },

      cleanupSessions: (scopeKey: string, existingSessionIds: Set<string>): void => {
        if (!scopeKey) return
        const current = get().foldersMap
        const scopeFolders = current[scopeKey]
        if (!scopeFolders || scopeFolders.length === 0) return

        let changed = false
        const filteredFolders = scopeFolders.map((folder) => {
          const filtered = folder.sessionIds.filter((id) => existingSessionIds.has(id))
          if (filtered.length !== folder.sessionIds.length) {
            changed = true
            return { ...folder, sessionIds: filtered }
          }
          return folder
        })

        const nextFolders = pruneEmptyArchivedFolders(scopeKey, filteredFolders)
        if (nextFolders.length !== filteredFolders.length) {
          changed = true
        }

        if (!changed) return
        const nextMap: SessionFoldersMap = { ...current, [scopeKey]: nextFolders }
        const nextCollapsed = syncCollapsedAfterFolderCleanup(scopeFolders, nextFolders, get().collapsedFolderIds)

        set(nextCollapsed ? { foldersMap: nextMap, collapsedFolderIds: nextCollapsed } : { foldersMap: nextMap })
        persistState(nextMap, nextCollapsed ?? get().collapsedFolderIds)
      },

      getSessionFolderId: (scopeKey: string, sessionId: string): string | null => {
        if (!scopeKey || !sessionId) return null
        const scopeFolders = get().foldersMap[scopeKey]
        if (!scopeFolders) return null
        for (const folder of scopeFolders) {
          if (folder.sessionIds.includes(sessionId)) {
            return folder.id
          }
        }
        return null
      },
    }),
    { name: "session-folders-store" },
  ),
)

// A window that starts before the local server answers used to give up permanently: hydration is
// bootstrapped once and the flag was set in `finally` even when the read failed, so disk folders
// (from another window or machine) never appeared. Retry a few times with backoff instead.
let diskHydrationAttempts = 0
let diskHydrationRetryTimer: number | null = null
const MAX_DISK_HYDRATION_ATTEMPTS = 5

const scheduleDiskHydrationRetry = (): void => {
  if (typeof window === "undefined" || diskHydrationRetryTimer) {
    return
  }
  if (diskHydrationAttempts >= MAX_DISK_HYDRATION_ATTEMPTS) {
    return
  }
  diskHydrationAttempts += 1
  diskHydrationRetryTimer = window.setTimeout(() => {
    diskHydrationRetryTimer = null
    void hydrateSessionFoldersFromDisk()
  }, Math.min(30_000, 2_000 * diskHydrationAttempts))
}

const hydrateSessionFoldersFromDisk = async (): Promise<void> => {
  if (diskHydrated || diskHydrationInFlight || typeof window === "undefined") {
    return
  }

  diskHydrationInFlight = true

  try {
    const response = await fetch(SESSION_FOLDERS_API_PATH).catch(() => null)
    if (!response || !response.ok) {
      scheduleDiskHydrationRetry()
      return
    }

    const parsed = (await response.json().catch(() => null)) as {
      foldersMap?: SessionFoldersMap
      collapsedFolderIds?: string[]
      revision?: unknown
    } | null

    if (!parsed) {
      scheduleDiskHydrationRetry()
      return
    }

    const diskFolders = normalizeFoldersMap(parsed.foldersMap)
    const diskCollapsed = Array.isArray(parsed.collapsedFolderIds)
      ? toStringSet(parsed.collapsedFolderIds)
      : new Set<string>()

    const diskSnapshot: SessionFoldersSnapshot = { foldersMap: diskFolders, collapsedFolderIds: Array.from(diskCollapsed) }
    const revision = readRevision(parsed.revision)
    if (revision !== null) {
      diskRevision = revision
      diskSyncedSnapshot = diskSnapshot
    }

    const hasDiskData = Object.keys(diskFolders).length > 0 || diskCollapsed.size > 0
    if (!hasDiskData) {
      diskHydrated = true
      return
    }

    // A folder created/edited locally while this fetch was in flight must
    // win over the (now stale) disk snapshot — otherwise it would vanish
    // from the UI the instant hydration lands. The edits since boot are merged
    // into the disk state instead of replacing it, so folders another window
    // saved survive; the pending debounced write then saves the merge.
    if (hasLocalFoldersMutation) {
      applyMergedSnapshot(mergeSessionFolderSnapshots(initialLocalSnapshot, readStoreSnapshot(), diskSnapshot))
      diskHydrated = true
      void writeSessionFoldersToDisk()
      return
    }

    useSessionFoldersStore.setState({
      foldersMap: diskFolders,
      collapsedFolderIds: diskCollapsed,
    })

    persistFolders(diskFolders)
    persistCollapsed(diskCollapsed)
    diskHydrated = true
  } catch {
    scheduleDiskHydrationRetry()
  } finally {
    diskHydrationInFlight = false
  }
}

const bootstrapSessionFoldersDiskHydration = (): void => {
  if (typeof window === "undefined") {
    return
  }

  void hydrateSessionFoldersFromDisk()
}

/** What this window loaded from localStorage at boot: the base for merging edits made before hydration. */
const initialLocalSnapshot = readStoreSnapshot()

bootstrapSessionFoldersDiskHydration()
