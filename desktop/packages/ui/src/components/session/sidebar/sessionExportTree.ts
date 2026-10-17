import type { Session } from "@defai-digital/ax-code-sdk/v2"

import { useGlobalSessionsStore } from "@/stores/useGlobalSessionsStore"

import type { SessionNode } from "./types"

/**
 * A session's active subtree built the way the project tree builds it: it stops at an archived session and at
 * everything below it. The global cache holds the whole active tree, which a flat row does not render.
 */
export const buildActiveSessionTree = (sessions: readonly Session[], root: Session): SessionNode => {
  const childrenByParentId = new Map<string, Session[]>()
  for (const session of sessions) {
    const parentId = (session as Session & { parentID?: string | null }).parentID
    if (!parentId) continue
    const siblings = childrenByParentId.get(parentId) ?? []
    siblings.push(session)
    childrenByParentId.set(parentId, siblings)
  }

  // The cache is merged from snapshots and is not guaranteed to be acyclic. A visited set bounds the walk even if a
  // session names an ancestor as its parent.
  const build = (session: Session, visited: Set<string>): SessionNode => {
    visited.add(session.id)
    return {
      session,
      children: (childrenByParentId.get(session.id) ?? [])
        .filter((child) => !child.time?.archived && !visited.has(child.id))
        .map((child) => build(child, visited)),
      worktree: null,
    }
  }

  return build(root, new Set())
}

/**
 * The tree an export offers. A flat row — Live, recent, or any row without rendered children — resolves its
 * subtree from the cache when the user acts, so the subtask option and its count match what is actually there.
 */
export const resolveSessionExportTree = (node: SessionNode, session: Session): SessionNode =>
  node.children.length > 0 ? node : buildActiveSessionTree(useGlobalSessionsStore.getState().activeSessions, session)
