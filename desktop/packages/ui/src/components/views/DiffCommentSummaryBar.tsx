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
  const draftCount = drafts.length
  const sendingRef = React.useRef(false)
  const rootRef = React.useRef<HTMLDivElement>(null)

  const handleSendToAgent = React.useCallback(async () => {
    if (!currentSessionId || !sessionKey) {
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
    const config = useConfigStore.getState()
    const providerId = config.currentProviderId ?? ""
    const modelId = config.currentModelId ?? ""

    sendingRef.current = true
    try {
      await useSessionUIStore
        .getState()
        .sendMessage(formatted, providerId, modelId, undefined, undefined, undefined, undefined, undefined, "normal", {
          sessionId: currentSessionId,
        })
      clearDrafts(sessionKey)
      toast.success(t("diffView.comments.sent"))
    } catch {
      toast.error(t("diffView.comments.sendFailed"))
    } finally {
      sendingRef.current = false
    }
  }, [clearDrafts, currentSessionId, sessionKey, t])

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
      <span className="typography-ui-label font-medium text-foreground flex-shrink-0">
        {t("diffView.comments.summaryTitle", { count: draftCount })}
      </span>
      <div className="flex-1" />
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
