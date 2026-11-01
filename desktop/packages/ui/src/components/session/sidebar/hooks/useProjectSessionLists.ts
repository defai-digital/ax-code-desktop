import React from "react"
import type { Session } from "@defai-digital/ax-code-sdk/v2"
import { dedupeSessionsById, normalizePath, resolveOwningProjectRoot } from "../utils"
import type { WorktreeMeta } from "../types"

type Args = {
  sessions: Session[]
  archivedSessions: Session[]
  availableWorktreesByProject: Map<string, WorktreeMeta[]>
  /** Every registered project root, so a session is assigned to only its most-specific owner. */
  allProjectRoots: string[]
}

export const useProjectSessionLists = (args: Args) => {
  const { sessions, archivedSessions, availableWorktreesByProject, allProjectRoots } = args

  // Archived sections are built once per project. Resolve ownership once for
  // each session instead of scanning every project root for every section.
  const ownerProjectRootBySessionId = React.useMemo(() => {
    const owners = new Map<string, string | null>()
    for (const session of [...sessions, ...archivedSessions]) {
      owners.set(session.id, resolveOwningProjectRoot(session, allProjectRoots, availableWorktreesByProject))
    }
    return owners
  }, [allProjectRoots, archivedSessions, availableWorktreesByProject, sessions])

  // Live sessions use the same ownership as archived ones and the rest of the app: a session belongs
  // to the most specific project (or project worktree) containing its directory. Matching only the
  // exact project folder hid sessions started in a subfolder, such as a repository under ~/code.
  const liveSessionsByOwnerRoot = React.useMemo(() => {
    const next = new Map<string, Session[]>()
    for (const session of sessions) {
      const owner = ownerProjectRootBySessionId.get(session.id)
      if (!owner) continue
      const bucket = next.get(owner)
      if (bucket) bucket.push(session)
      else next.set(owner, [session])
    }
    return next
  }, [ownerProjectRootBySessionId, sessions])

  const getSessionsForProject = React.useCallback(
    (project: { normalizedPath: string }) =>
      dedupeSessionsById(liveSessionsByOwnerRoot.get(project.normalizedPath) ?? []),
    [liveSessionsByOwnerRoot],
  )

  // The archived list of a project is its archived sessions followed by the live
  // sessions that have no directory of their own (a project worktree stands in
  // for it). The sidebar asks for every project's list on each rebuild, so both
  // are bucketed once by owner instead of filtering and normalizing every
  // session once per project.
  const archivedSessionsByOwnerRoot = React.useMemo(() => {
    const next = new Map<string, Session[]>()
    const add = (session: Session) => {
      const owner = ownerProjectRootBySessionId.get(session.id)
      if (!owner) return
      const bucket = next.get(owner)
      if (bucket) bucket.push(session)
      else next.set(owner, [session])
    }
    for (const session of archivedSessions) add(session)
    for (const session of sessions) {
      if (session.time?.archived) continue
      const sessionDirectory = normalizePath((session as Session & { directory?: string | null }).directory ?? null)
      if (sessionDirectory) continue
      const projectWorktree = normalizePath(
        (session as Session & { project?: { worktree?: string | null } | null }).project?.worktree ?? null,
      )
      if (!projectWorktree) continue
      add(session)
    }
    return next
  }, [archivedSessions, ownerProjectRootBySessionId, sessions])

  const getArchivedSessionsForProject = React.useCallback(
    (project: { normalizedPath: string }) =>
      dedupeSessionsById(archivedSessionsByOwnerRoot.get(project.normalizedPath) ?? []),
    [archivedSessionsByOwnerRoot],
  )

  return {
    getSessionsForProject,
    getArchivedSessionsForProject,
  }
}
