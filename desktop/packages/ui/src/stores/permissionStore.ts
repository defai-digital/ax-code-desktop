import { create } from "zustand"
import { devtools, persist, createJSONStorage } from "zustand/middleware"
import type { Session } from "@defai-digital/ax-code-sdk/v2/client"
import {
  autoRespondsPermission,
  resolveSessionLineage,
  type PermissionAutoAcceptMap,
} from "./utils/permissionAutoAccept"
import { getSafeStorage } from "./utils/safeStorage"
import { getAllSyncSessions, getSyncChildStores } from "@/sync/sync-refs"
import { axCodeClient } from "@/lib/ax-code/client"
import { respondToPermission, waitForConnectionOrThrow } from "@/sync/session-actions"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { API_ENDPOINTS } from "@/lib/http"
import { createAutoAcceptSync } from "./utils/autoAcceptSync"
import {
  registerSessionAutoAcceptInheritHandler,
  registerSessionAutoAcceptSeedHandler,
} from "./utils/sessionAutoAcceptSeed"

interface PermissionState {
  autoAccept: PermissionAutoAcceptMap
  /**
   * The choice made in the new-chat composer before a session exists. Newly
   * created root sessions record it as their own setting; sessions that
   * already existed stay off unless the user turns them on. Persisted so the
   * choice survives a restart.
   */
  defaultAutoAccept: boolean
}

interface PermissionActions {
  isSessionAutoAccepting: (sessionId: string) => boolean
  setSessionAutoAccept: (sessionId: string | null, enabled: boolean) => Promise<void>
  /**
   * Give a newly created root session its own auto-accept value. Child
   * sessions are left unset so they inherit their parent's choice, and an
   * existing explicit value is never overwritten.
   */
  applyDefaultToNewSession: (sessionId: string, parentID: string | null) => void
  /**
   * Give a forked session the source session's effective auto-accept value.
   * A fork is a new root session with no parentID, so lineage inheritance
   * cannot carry a source that never had an explicit setting.
   */
  inheritSessionAutoAccept: (sourceSessionId: string, sessionId: string) => void
  /**
   * Drop auto-accept entries for deleted sessions. Without this the persisted
   * map only ever grows, and every startup re-broadcasts a suppression POST
   * for each long-gone session (onRehydrateStorage).
   */
  pruneAutoAccept: (sessionIds: Iterable<string>) => void
}

type PermissionStore = PermissionState & PermissionActions

const coerceAutoAcceptValue = (value: unknown): boolean => {
  if (typeof value === "boolean") {
    return value
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    if (normalized === "true") {
      return true
    }
    if (normalized === "false") {
      return false
    }
  }

  if (typeof value === "number") {
    return value === 1
  }

  return false
}

// Newly created root sessions start with auto-accept on. A persisted value
// that is missing or unreadable keeps that default instead of silently turning
// the feature off.
const coerceDefaultAutoAccept = (value: unknown): boolean => {
  if (typeof value === "boolean") {
    return value
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    if (normalized === "true") {
      return true
    }
    if (normalized === "false") {
      return false
    }
  }

  if (typeof value === "number") {
    return value === 1
  }

  return true
}

const isLegacyDirectoryAutoAcceptKey = (key: string): boolean => key.endsWith("/*")

const extractSessionIdFromLegacyKey = (key: string): string | null => {
  const trimmed = key.trim()
  if (!trimmed) {
    return null
  }
  const lastSlash = trimmed.lastIndexOf("/")
  if (lastSlash === -1 || lastSlash === trimmed.length - 1) {
    return trimmed
  }
  return trimmed.slice(lastSlash + 1)
}

const resolveSessionScope = (sessionID: string, sessions: Session[]): Set<string> => {
  const map = new Map<string, Session>()
  const children = new Map<string, string[]>()
  for (const session of sessions) {
    map.set(session.id, session)
    if (session.parentID) {
      const list = children.get(session.parentID)
      if (list) {
        list.push(session.id)
      } else {
        children.set(session.parentID, [session.id])
      }
    }
  }

  if (!map.has(sessionID)) {
    return new Set([sessionID])
  }

  const result = new Set<string>()
  const seen = new Set<string>()
  const queue = [sessionID]
  while (queue.length > 0) {
    const current = queue.shift()
    if (!current || seen.has(current)) {
      continue
    }
    seen.add(current)
    result.add(current)
    const nextChildren = children.get(current)
    if (!nextChildren || nextChildren.length === 0) {
      continue
    }
    for (const child of nextChildren) {
      if (!seen.has(child)) {
        queue.push(child)
      }
    }
  }

  return result
}

const normalizeDirectoryCandidate = (value: unknown): string | null => {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

const collectPendingFromSyncStores = (): Array<{ id: string; sessionID: string }> => {
  try {
    const stores = getSyncChildStores()
    const pending: Array<{ id: string; sessionID: string }> = []
    for (const store of stores.children.values()) {
      const permissionMap = store.getState().permission ?? {}
      for (const [sessionId, entries] of Object.entries(permissionMap)) {
        for (const permission of entries ?? []) {
          if (!permission?.id) continue
          pending.push({ id: permission.id, sessionID: permission.sessionID || sessionId })
        }
      }
    }
    return pending
  } catch {
    return []
  }
}

// Dedups session fetches across overlapping ancestor-chain walks; entries are
// removed once settled so session data is never served stale.
const sessionFetchInFlight = new Map<string, { promise: Promise<Session | null> }>()

const sessionBelongsToScope = async (
  sessionID: string,
  rootSessionID: string,
  knownSessions: Session[],
  directories: string[],
): Promise<boolean> => {
  if (sessionID === rootSessionID) {
    return true
  }

  const knownById = new Map<string, Session>()
  for (const session of knownSessions) {
    knownById.set(session.id, session)
  }

  const fetchedById = new Map<string, Session>()
  const fetchSession = async (id: string): Promise<Session | null> => {
    const known = knownById.get(id) ?? fetchedById.get(id)
    if (known) return known

    const inFlight = sessionFetchInFlight.get(id)
    if (inFlight) {
      const session = await inFlight.promise
      if (session) fetchedById.set(id, session)
      return session
    }

    const task = (async () => {
      for (const directory of directories) {
        try {
          const result = await axCodeClient.getScopedSdkClient(directory).session.get({
            sessionID: id,
            directory,
          })
          if (result.data) {
            return result.data
          }
        } catch {
          // Try the next known project directory.
        }
      }

      try {
        const result = await axCodeClient.getSdkClient().session.get({ sessionID: id })
        if (result.data) {
          return result.data
        }
      } catch {
        // Missing session metadata means we cannot safely inherit the parent setting.
      }

      return null
    })()

    const slot = { promise: task }
    sessionFetchInFlight.set(id, slot)
    try {
      const session = await task
      if (session) fetchedById.set(id, session)
      return session
    } finally {
      if (sessionFetchInFlight.get(id) === slot) {
        sessionFetchInFlight.delete(id)
      }
    }
  }

  const seen = new Set<string>()
  let current: string | undefined = sessionID
  while (current && !seen.has(current)) {
    if (current === rootSessionID) {
      return true
    }
    seen.add(current)
    const session = await fetchSession(current)
    current = session?.parentID ?? undefined
  }

  return false
}

const autoRespondsPermissionBySession = (
  autoAccept: PermissionAutoAcceptMap,
  sessions: Session[],
  sessionID: string,
): boolean => {
  return autoRespondsPermission({
    autoAccept,
    sessionID,
    sessions,
  })
}

const getStorage = () => createJSONStorage(() => getSafeStorage())

// One sync per store instance: it keeps the values the server has not confirmed
// yet and retries them, so a dropped POST cannot leave the server suppressing
// notifications for a session the client no longer auto-answers.
const autoAcceptSync = createAutoAcceptSync({
  post: (sessionId, enabled) =>
    fetch(API_ENDPOINTS.notifications.autoAccept, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, enabled }),
    }),
})

export const usePermissionStore = create<PermissionStore>()(
  devtools(
    persist(
      (set, get) => ({
        autoAccept: {},
        defaultAutoAccept: true,

        pruneAutoAccept: (sessionIds: Iterable<string>) => {
          const idSet = sessionIds instanceof Set ? sessionIds : new Set(sessionIds)
          if (idSet.size === 0) return
          set((state) => {
            let changed = false
            const autoAccept = { ...state.autoAccept }
            for (const sessionId of idSet) {
              if (sessionId in autoAccept) {
                delete autoAccept[sessionId]
                changed = true
              }
            }
            return changed ? { autoAccept } : state
          })
        },

        isSessionAutoAccepting: (sessionId: string) => {
          // An empty ID is not a session (a malformed event, or the new-chat
          // composer); the composer reads defaultAutoAccept directly.
          if (!sessionId) {
            return false
          }

          const sessions = getAllSyncSessions()
          return autoRespondsPermissionBySession(get().autoAccept, sessions, sessionId)
        },

        applyDefaultToNewSession: (sessionId: string, parentID: string | null) => {
          if (!sessionId || parentID) {
            return
          }

          const state = get()
          if (Object.prototype.hasOwnProperty.call(state.autoAccept, sessionId)) {
            return
          }

          set({
            autoAccept: { ...state.autoAccept, [sessionId]: state.defaultAutoAccept },
          })
          autoAcceptSync.set(sessionId, state.defaultAutoAccept)
        },

        inheritSessionAutoAccept: (sourceSessionId: string, sessionId: string) => {
          if (!sessionId || !sourceSessionId) {
            return
          }

          const state = get()
          if (Object.prototype.hasOwnProperty.call(state.autoAccept, sessionId)) {
            return
          }

          const sessions = getAllSyncSessions()
          const effective = autoRespondsPermissionBySession(state.autoAccept, sessions, sourceSessionId)
          set({
            autoAccept: { ...state.autoAccept, [sessionId]: effective },
          })
          autoAcceptSync.set(sessionId, effective)
        },

        setSessionAutoAccept: async (sessionId: string | null, enabled: boolean) => {
          if (!sessionId) {
            // No session yet: the choice becomes the value newly created
            // sessions record. Existing sessions keep their own setting.
            set({ defaultAutoAccept: enabled })
            return
          }

          const sessions = getAllSyncSessions()

          set((state) => {
            const autoAccept = { ...state.autoAccept }
            autoAccept[sessionId] = enabled
            return { autoAccept }
          })

          const sessionScope = resolveSessionScope(sessionId, sessions)

          // Mirror inherited state to the server so it can suppress
          // permission notifications before the client auto-response
          // round-trip. Send known descendants too; server-side
          // ancestry lookup can lag AX Code session indexing. A descendant
          // with its own explicit setting keeps it: broadcasting the parent's
          // value to the whole scope made the server suppress notifications for a
          // session the user had switched OFF.
          for (const scopedSessionId of sessionScope) {
            const live = get().autoAccept
            const hasOwnSetting = Object.prototype.hasOwnProperty.call(live, scopedSessionId)
            const effective = hasOwnSetting ? live[scopedSessionId] === true : enabled
            autoAcceptSync.set(scopedSessionId, effective)
          }

          if (!enabled) {
            return
          }

          const sessionDirectory = useSessionUIStore.getState().getDirectoryForSession(sessionId)
          const directories = new Set<string>()
          const currentDirectory = normalizeDirectoryCandidate(axCodeClient.getDirectory())
          if (currentDirectory) {
            directories.add(currentDirectory)
          }
          const mappedSessionDirectory = normalizeDirectoryCandidate(sessionDirectory)
          if (mappedSessionDirectory) {
            directories.add(mappedSessionDirectory)
          }
          for (const scopedSessionId of sessionScope) {
            const mapped = normalizeDirectoryCandidate(
              useSessionUIStore.getState().getDirectoryForSession(scopedSessionId),
            )
            if (mapped) {
              directories.add(mapped)
            }
          }

          const directoryList = Array.from(directories)
          const pendingFromStores = collectPendingFromSyncStores()
          // Best-effort: if listPendingPermissions throws (transient fetch failure),
          // proceed with whatever sync-store snapshots gave us. The next SSE event
          // or reconnect resync will auto-accept anything we missed.
          const pendingFromApi = await axCodeClient
            .listPendingPermissions({ directories: Array.from(directories) })
            .catch(() => [])
          const mergedPending = new Map<string, { id: string; sessionID: string }>()

          for (const permission of pendingFromStores) {
            if (sessionScope.has(permission.sessionID)) {
              mergedPending.set(permission.id, permission)
              continue
            }
            if (await sessionBelongsToScope(permission.sessionID, sessionId, sessions, directoryList)) {
              mergedPending.set(permission.id, permission)
            }
          }
          for (const permission of pendingFromApi) {
            if (!permission?.id || !permission?.sessionID) {
              continue
            }
            if (!sessionScope.has(permission.sessionID)) {
              const belongsToScope = await sessionBelongsToScope(
                permission.sessionID,
                sessionId,
                sessions,
                directoryList,
              )
              if (!belongsToScope) {
                continue
              }
            }
            mergedPending.set(permission.id, { id: permission.id, sessionID: permission.sessionID })
          }

          // The gather above awaits network calls (pending-permission list +
          // ancestry lookups), and the reply itself waits for a connection, so
          // the user may have switched auto-accept off in between. Decide from
          // the live map, per permission, as late as possible: the nearest
          // ancestor with an explicit setting wins, which is why a descendant
          // turned OFF is not auto-approved just because its parent is ON.
          const shouldAutoRespondToPermission = (permissionSessionID: string): boolean => {
            const live = get().autoAccept
            if (live[sessionId] !== true) {
              return false
            }
            const lineage = resolveSessionLineage(permissionSessionID, getAllSyncSessions())
            for (const ancestorId of lineage) {
              if (!Object.prototype.hasOwnProperty.call(live, ancestorId)) {
                continue
              }
              return live[ancestorId] === true
            }
            // Lineage unknown (a descendant the sync snapshot does not know yet):
            // keep the scope decision that gathered this permission.
            return true
          }

          await Promise.all(
            Array.from(mergedPending.values()).map(async (permission) => {
              // Wait for the connection first so the check below is the last
              // thing before the reply: respondToPermission would otherwise wait
              // up to its grace period after the toggle was read.
              await waitForConnectionOrThrow().catch(() => undefined)
              if (!shouldAutoRespondToPermission(permission.sessionID)) {
                return
              }
              return respondToPermission(permission.sessionID, permission.id, "once").catch(() => undefined)
            }),
          )
        },
      }),
      {
        name: "permission-store",
        storage: getStorage(),
        partialize: (state) => ({
          autoAccept: state.autoAccept,
          defaultAutoAccept: state.defaultAutoAccept,
        }),
        merge: (persistedState, currentState) => {
          const merged = {
            ...currentState,
            ...(persistedState as Partial<PermissionStore>),
          }

          const persisted = Object.entries(merged.autoAccept || {})
          const nextAutoAccept: PermissionAutoAcceptMap = {}

          for (const [rawKey, rawEnabled] of persisted) {
            if (rawKey.includes("/") || isLegacyDirectoryAutoAcceptKey(rawKey)) {
              continue
            }
            nextAutoAccept[rawKey] = coerceAutoAcceptValue(rawEnabled)
          }

          for (const [rawKey, rawEnabled] of persisted) {
            if (isLegacyDirectoryAutoAcceptKey(rawKey)) {
              continue
            }
            if (!rawKey.includes("/")) {
              continue
            }

            const sessionId = extractSessionIdFromLegacyKey(rawKey)
            if (!sessionId) {
              continue
            }
            if (Object.prototype.hasOwnProperty.call(nextAutoAccept, sessionId)) {
              continue
            }

            const normalized = coerceAutoAcceptValue(rawEnabled)
            const existing = nextAutoAccept[sessionId]
            nextAutoAccept[sessionId] = existing === true ? true : normalized
          }

          return {
            ...merged,
            autoAccept: nextAutoAccept,
            defaultAutoAccept: coerceDefaultAutoAccept(merged.defaultAutoAccept),
          }
        },
        onRehydrateStorage: () => (state) => {
          if (!state) return
          // Re-broadcast the WHOLE effective map after a reload or a server
          // restart — including the sessions the user switched OFF. Replaying
          // only the enabled ones left the server suppressing notifications for a
          // session the client no longer auto-answers, so an unattended prompt
          // waited forever.
          for (const [sid, enabled] of Object.entries(state.autoAccept || {})) {
            autoAcceptSync.set(sid, enabled === true)
          }
          void autoAcceptSync.flushPending()
        },
      },
    ),
    { name: "permission-store" },
  ),
)

registerSessionAutoAcceptSeedHandler((sessionId, parentID) => {
  usePermissionStore.getState().applyDefaultToNewSession(sessionId, parentID)
})

registerSessionAutoAcceptInheritHandler((sessionId, sourceSessionId) => {
  usePermissionStore.getState().inheritSessionAutoAccept(sourceSessionId, sessionId)
})
