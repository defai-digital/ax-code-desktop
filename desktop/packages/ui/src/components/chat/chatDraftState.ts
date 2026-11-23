export const shouldAutoOpenChatDraft = (input: {
  autoOpenDraft: boolean
  currentSessionId: string | null
  draftOpen: boolean
  hasSessionRoute: boolean
}): boolean => input.autoOpenDraft && !input.currentSessionId && !input.draftOpen && !input.hasSessionRoute

/**
 * Whether a draft-home project row may retarget the open draft. A worktree still being created is the draft's target,
 * as in the composer's own project picker: a send waiting for it would otherwise create its session in the worktree of
 * the project left behind.
 */
export const canRetargetDraftToProject = (draft: { pendingWorktreeRequestId?: string | null } | null | undefined) =>
  !draft?.pendingWorktreeRequestId
