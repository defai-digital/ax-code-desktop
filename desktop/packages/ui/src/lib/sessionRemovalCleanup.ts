/**
 * Fan-out cleanup for per-session client state after sessions are
 * hard-deleted. Lives in lib/ rather than inside useGlobalSessionsStore so the
 * removal funnel can reach every session-keyed store without adding store→store
 * import edges (desktop store boundary rule R1 — the allowlist may only
 * shrink). Called only after a delete is confirmed (post-success path or a
 * session.deleted event); archive and pending-removal flows must keep this
 * state so unarchive/undo restore the session intact.
 */
import { useMessageQueueStore } from "@/stores/messageQueueStore"
import { usePermissionStore } from "@/stores/permissionStore"
import { useInlineCommentDraftStore } from "@/stores/useInlineCommentDraftStore"
import { useSessionMultiSelectStore } from "@/stores/useSessionMultiSelectStore"
import { useSessionRollbackStore } from "@/stores/useSessionRollbackStore"
import { useSessionUIStore } from "@/sync/session-ui-store"

export function cleanupRemovedSessions(ids: Iterable<string>): void {
  const idSet = ids instanceof Set ? ids : new Set(ids)
  if (idSet.size === 0) return
  // Queued messages (incl. base64 attachments) and auto-accept toggles are
  // persisted; without pruning both maps grow forever and the auto-accept one
  // re-broadcasts a server POST per dead session on every startup.
  useMessageQueueStore.getState().clearSessions(idSet)
  usePermissionStore.getState().pruneAutoAccept(idSet)
  // Cached rollback points for dead sessions are unreachable and would
  // otherwise accumulate per (directory, session, tool) key.
  useSessionRollbackStore.getState().clearSessions(idSet)
  // Inline comment drafts persist keyed by session id; once the session is
  // gone the drafts can never be reached from the UI again.
  const drafts = useInlineCommentDraftStore.getState()
  for (const id of idSet) {
    drafts.clearDrafts(id)
  }
  // Keep an active multi-select consistent so the selection count cannot
  // include sessions that no longer exist.
  useSessionMultiSelectStore.getState().removeMany([...idSet])
  // Abort flags, plan-availability and dismissed change bars are never removed by their own
  // actions; the worktree attachment would keep routing to a dead session's worktree.
  useSessionUIStore.getState().clearRemovedSessionState(idSet)
}
