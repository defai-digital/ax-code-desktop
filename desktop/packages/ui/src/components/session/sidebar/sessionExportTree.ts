import type { Session } from "@defai-digital/ax-code-sdk/v2"

import { useGlobalSessionsStore } from "@/stores/useGlobalSessionsStore"

import type { SessionNode } from "./types"

/**
 * A session's subtree built the way the project tree builds it: children are nested only under a parent in the same
 * archived state, and everything below a session of the other state is left out. The global cache holds the whole
 * tree, which a flat row does not render.
 */
export const buildActiveSessionTree = (sessions: readonly Session[], root: Session): SessionNode => {
  // The cache is merged from snapshots and can repeat an entry. Keep the later copy, as `dedupeSessionsById` does
  // for the project tree, or the export can carry a stale title and timestamp.
  const byId = new Map<string, Session>()
  for (const session of sessions) byId.set(session.id, session)

  const childrenByParentId = new Map<string, Session[]>()
  for (const session of byId.values()) {
    const parentId = (session as Session & { parentID?: string | null }).parentID
    if (!parentId) continue
    const siblings = childrenByParentId.get(parentId) ?? []
    siblings.push(session)
    childrenByParentId.set(parentId, siblings)
  }

  // The cache is not guaranteed to be acyclic. A visited set bounds the walk even if a session names an ancestor as
  // its parent.
  const build = (session: Session, visited: Set<string>): SessionNode => {
    visited.add(session.id)
    const archived = Boolean(session.time?.archived)
    return {
      session,
      children: (childrenByParentId.get(session.id) ?? [])
        .filter((child) => Boolean(child.time?.archived) === archived && !visited.has(child.id))
        .map((child) => build(child, visited)),
      worktree: null,
    }
  }

  return build(byId.get(root.id) ?? root, new Set())
}

/**
 * The tree an export offers. A flat row — Live, recent, or any row without rendered children — resolves its
 * subtree from the cache when the user acts, so the subtask option and its count match what is actually there.
 */
export const resolveSessionExportTree = (node: SessionNode, session: Session): SessionNode => {
  if (node.children.length > 0) return node
  const { activeSessions, archivedSessions } = useGlobalSessionsStore.getState()
  // The row's copy can be stale: take the bucket and the root from the cache when it holds one.
  const cachedArchived = archivedSessions.find((candidate) => candidate.id === session.id)
  return cachedArchived
    ? buildActiveSessionTree(archivedSessions, cachedArchived)
    : buildActiveSessionTree(activeSessions, session)
}
