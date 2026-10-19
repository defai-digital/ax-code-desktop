import React from "react"
import type { Session } from "@defai-digital/ax-code-sdk/v2"
import { useSessionFoldersStore } from "@/stores/useSessionFoldersStore"
import { normalizePath, resolveOwningProjectRoot } from "../utils"
import type { WorktreeMeta } from "../types"

type NormalizedProject = {
  id: string
  normalizedPath: string
}

type Args = {
  isSessionsLoading: boolean
  /**
   * The global session index hydrates asynchronously. Until its first snapshot
   * lands, an empty `sessions` list says nothing about which sessions exist.
   */
  hasLoadedGlobalSessions: boolean
  sessions: Session[]
  archivedSessions: Session[]
  normalizedProjects: NormalizedProject[]
  availableWorktreesByProject: Map<string, WorktreeMeta[]>
  cleanupSessions: (scopeKey: string, validSessionIds: Set<string>) => void
}

export const useSessionFolderCleanup = (args: Args): void => {
  const {
    isSessionsLoading,
    hasLoadedGlobalSessions,
    sessions,
    archivedSessions,
    normalizedProjects,
    availableWorktreesByProject,
    cleanupSessions,
  } = args

  React.useEffect(() => {
    // `isLoading` in the session UI store is never set by production code, so on a
    // cold start this effect used to run with the still-empty session index and
    // prune every known project scope. Wait for the global index to hydrate.
    if (isSessionsLoading || !hasLoadedGlobalSessions) {
      return
    }

    const store = useSessionFoldersStore.getState()

    // The per-sub-directory archived auto-folders were retired — archived
    // sessions now render as a flat list. Purge any that were persisted so they
    // can't resurface as fake "projects" (e.g. `ax-code`) under Archived.
    Object.keys(store.foldersMap).forEach((scopeKey) => {
      if (!scopeKey.startsWith("__archived__:")) {
        return
      }
      for (const folder of store.foldersMap[scopeKey] ?? []) {
        store.deleteFolder(scopeKey, folder.id)
      }
    })

    // Maintain manual (directory-scoped) folders: drop sessions that no longer exist.
    // Archived sessions still exist — archiving is reversible — so they count as
    // existing here. Pruning them removed a session from its folder on archive
    // (and undoing the archive never put it back), the same trap the pin-prune
    // whitelist avoids by counting archived sessions.
    //
    // The membership set has to use the same scopes the sidebar files sessions
    // under. A session in a nested, unregistered directory (`~/code/other-repo`
    // under the `~/code` project) is listed in that project's root group, whose
    // folders are keyed by the project root — keying by the raw session
    // directory missed it and silently pruned it from its folder. Counting both
    // scopes only ever keeps an entry the folder row filters out when rendering.
    const projectRoots = normalizedProjects.map((project) => project.normalizedPath)
    const knownScopes = new Set(projectRoots.map((root) => normalizePath(root)).filter(Boolean) as string[])
    const idsByScope = new Map<string, Set<string>>()
    const addToScope = (scopeKey: string | null, sessionId: string) => {
      const scope = normalizePath(scopeKey)
      if (!scope) {
        return
      }
      const existing = idsByScope.get(scope)
      if (existing) {
        existing.add(sessionId)
        return
      }
      idsByScope.set(scope, new Set([sessionId]))
    }
    for (const session of [...sessions, ...archivedSessions]) {
      addToScope(normalizePath((session as Session & { directory?: string | null }).directory ?? null), session.id)
      addToScope(resolveOwningProjectRoot(session, projectRoots, availableWorktreesByProject), session.id)
    }

    Object.keys(store.foldersMap).forEach((scopeKey) => {
      if (scopeKey.startsWith("__archived__:")) {
        return
      }
      const ids = idsByScope.get(scopeKey)
      // A scope that produced no ids is not evidence that its sessions are gone: the
      // projects, sessions and archived-sessions stores hydrate in separate updates after
      // the session-load flag clears, so a project can be missing from this snapshot while
      // its folders are perfectly valid - and pruning on "no ids computed" emptied every
      // folder in it and persisted that, destroying the user's organisation for good.
      // A scope this snapshot can still account for - one with ids, or one that is still a
      // registered project root - keeps pruning, so a deleted session is still dropped.
      if (!ids && !knownScopes.has(scopeKey)) {
        return
      }
      cleanupSessions(scopeKey, ids ?? new Set<string>())
    })
  }, [
    archivedSessions,
    availableWorktreesByProject,
    cleanupSessions,
    hasLoadedGlobalSessions,
    isSessionsLoading,
    normalizedProjects,
    sessions,
  ])
}
