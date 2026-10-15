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
  sessions: Session[]
  archivedSessions: Session[]
  normalizedProjects: NormalizedProject[]
  availableWorktreesByProject: Map<string, WorktreeMeta[]>
  cleanupSessions: (scopeKey: string, validSessionIds: Set<string>) => void
}

export const useSessionFolderCleanup = (args: Args): void => {
  const { isSessionsLoading, sessions, archivedSessions, normalizedProjects, availableWorktreesByProject, cleanupSessions } =
    args

  React.useEffect(() => {
    if (isSessionsLoading) {
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
      cleanupSessions(scopeKey, idsByScope.get(scopeKey) ?? new Set<string>())
    })
  }, [archivedSessions, availableWorktreesByProject, cleanupSessions, isSessionsLoading, normalizedProjects, sessions])
}
