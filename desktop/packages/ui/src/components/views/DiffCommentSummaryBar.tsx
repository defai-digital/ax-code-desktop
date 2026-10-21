import React, { memo } from "react"
import { useInlineCommentDraftStore, type InlineCommentDraft } from "@/stores/useInlineCommentDraftStore"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { useConfigStore } from "@/stores/useConfigStore"
import { useI18n } from "@/lib/i18n"
import { Icon } from "@/components/icon/Icon"
import { Button } from "@/components/ui/button"
import { formatInlineCommentDrafts } from "@/lib/messages/inlineComments"
import { reviewKeyboardEventInEditableField } from "@/stores/useReviewProgressStore"
import { toast } from "@/components/ui"
import { useEffectiveDirectory } from "@/hooks/useEffectiveDirectory"
import { useSupervisionRows } from "@/hooks/useSupervisionRows"
import { resolveSessionSendConfig } from "@/hooks/useQueuedMessageAutoSend"
import { resolveProjectForDirectory } from "@/lib/projectResolution"
import { useProjectsStore } from "@/stores/useProjectsStore"

interface DiffCommentSummaryBarProps {
  sessionKey: string | null
  /** Whether to explain inline comments while there are none; off when there is nothing to comment on. */
  showHint?: boolean
}

const EMPTY_DRAFTS: InlineCommentDraft[] = []

export const DiffCommentSummaryBar: React.FC<DiffCommentSummaryBarProps> = memo(({ sessionKey, showHint = true }) => {
  const { t } = useI18n()
  const drafts = useInlineCommentDraftStore(
    React.useCallback((s) => (sessionKey ? (s.drafts[sessionKey] ?? EMPTY_DRAFTS) : EMPTY_DRAFTS), [sessionKey]),
  )
  const clearDrafts = useInlineCommentDraftStore((s) => s.clearDrafts)
  const currentSessionId = useSessionUIStore((s) => s.currentSessionId)
  const directory = useEffectiveDirectory()
  const rows = useSupervisionRows()
  // Comments can go to any live session working in this project (another agent may own the fix), like a
  // "send notes to" picker; the current session stays the default.
  const projects = useProjectsStore((s) => s.projects)
  const candidates = React.useMemo(() => {
    // Sessions of the same project, worktrees included: compare owning projects rather than raw directories.
    const project = resolveProjectForDirectory(projects, directory ?? null)
    return rows
      .filter(
        (row) =>
          row.sessionId === currentSessionId ||
          (project ? row.projectId === project.id : Boolean(directory) && row.directory === directory),
      )
      .map((row) => ({ id: row.sessionId, title: row.title }))
  }, [currentSessionId, directory, projects, rows])
  const [chosenTarget, setChosenTarget] = React.useState<string | null>(null)
  // A choice belongs to the drafts it was made for; another review's drafts start from the current session again.
  const [chosenFor, setChosenFor] = React.useState(sessionKey)
  if (chosenFor !== sessionKey) {
    setChosenFor(sessionKey)
    setChosenTarget(null)
  }
  const targetSessionId =
    chosenTarget && candidates.some((candidate) => candidate.id === chosenTarget)
      ? chosenTarget
      : (currentSessionId ?? candidates[0]?.id ?? null)
  const draftCount = drafts.length
  const sendingRef = React.useRef(false)
  const rootRef = React.useRef<HTMLDivElement>(null)

  const handleSendToAgent = React.useCallback(async () => {
    if (!targetSessionId || !sessionKey) {
      toast.error(t("diffView.comments.noSession"))
      return
    }
    if (sendingRef.current) return

    // Read the drafts without consuming them, so a failed send does not throw
    // the user's comments away. Clear only after the send succeeds. The ref
    // guards against a double-click re-sending while the first await is pending.
    const pending = useInlineCommentDraftStore.getState().drafts[sessionKey] ?? EMPTY_DRAFTS
    if (pending.length === 0) return

    const formatted = formatInlineCommentDrafts(pending)
    // Another session keeps its own agent and model; the current one uses what the composer has selected.
    const config = useConfigStore.getState()
    const target =
      targetSessionId === currentSessionId
        ? { providerID: config.currentProviderId, modelID: config.currentModelId, agent: undefined, variant: undefined }
        : resolveSessionSendConfig(targetSessionId)
    const providerId = target.providerID ?? ""
    const modelId = target.modelID ?? ""

    sendingRef.current = true
    try {
      await useSessionUIStore
        .getState()
        .sendMessage(formatted, providerId, modelId, target.agent, undefined, undefined, undefined, target.variant, "normal", {
          sessionId: targetSessionId,
        })
      clearDrafts(sessionKey)
      toast.success(t("diffView.comments.sent"))
    } catch {
      toast.error(t("diffView.comments.sendFailed"))
    } finally {
      sendingRef.current = false
    }
  }, [clearDrafts, currentSessionId, targetSessionId, sessionKey, t])

  const handleDiscard = React.useCallback(() => {
    if (!sessionKey) return
    clearDrafts(sessionKey)
  }, [clearDrafts, sessionKey])

  React.useEffect(() => {
    if (draftCount === 0) return
    const pane = rootRef.current?.closest("[data-review-changes]")
    if (!(pane instanceof HTMLElement)) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.repeat || event.isComposing) return
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return
      if (reviewKeyboardEventInEditableField(event)) return
      event.preventDefault()
      void handleSendToAgent()
    }

    pane.addEventListener("keydown", onKeyDown)
    return () => pane.removeEventListener("keydown", onKeyDown)
  }, [draftCount, handleSendToAgent])

  if (draftCount === 0) {
    if (!showHint) return null
    return (
      <div ref={rootRef} className="shrink-0 border-t border-border/40 px-3 py-1">
        <p className="truncate typography-meta text-muted-foreground">{t("diffView.comments.emptyHint")}</p>
      </div>
    )
  }

  return (
    <div
      ref={rootRef}
      className="sticky bottom-0 z-20 flex items-center gap-3 px-3 py-2 border-t border-border/60 bg-[var(--surface-elevated)] shadow-[0_-2px_8px_rgba(0,0,0,0.08)]"
    >
      <Icon name="chat-1" className="h-4 w-4 text-[var(--status-info)] flex-shrink-0" aria-hidden="true" />
      <span role="status" className="typography-ui-label font-medium text-foreground flex-shrink-0">
        {t("diffView.comments.summaryTitle", { count: draftCount })}
      </span>
      <div className="flex-1" />
      {candidates.length > 1 && targetSessionId ? (
        <select
          aria-label={t("diffView.comments.target")}
          value={targetSessionId}
          onChange={(event) => setChosenTarget(event.target.value)}
          className="h-6 min-w-0 max-w-[14rem] truncate rounded border border-border bg-background px-1.5 typography-micro text-foreground"
          data-comment-target
        >
          {candidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.title || candidate.id}
            </option>
          ))}
        </select>
      ) : null}
      <Button type="button" variant="default" size="xs" className="normal-case" onClick={handleSendToAgent}>
        <Icon name="send-plane" className="h-3 w-3 mr-1" aria-hidden="true" />
        {t("diffView.comments.send")}
      </Button>
      <Button type="button" variant="ghost" size="xs" className="normal-case" onClick={handleDiscard}>
        {t("diffView.comments.discard")}
      </Button>
    </div>
  )
})

DiffCommentSummaryBar.displayName = "DiffCommentSummaryBar"
