import React from "react"
import { Icon } from "@/components/icon/Icon"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n"
import { useUIStore } from "@/stores/useUIStore"
import {
  ActivityRowSkipContext,
  LIVE_ACTIVITY_VISIBLE_ROWS,
  countActivityRows,
  planActivityTrim,
} from "../lib/turns/activityRows"
import type { ChatMessageEntry, TurnRecord } from "../lib/turns/types"
import { getLiveFinalMessage } from "../lib/turns/liveActivity"
import { summarizeLiveActivity } from "../lib/turns/liveActivitySummary"
import { LiveActivityCollapse } from "./LiveActivityCollapse"
import { LiveFinalActivityContext } from "./liveActivityContext"
import { useActivityRowGlide } from "./useActivityRowGlide"

interface LiveTurnActivityProps {
  turn: TurnRecord
  hasLaterAssistant: boolean
  /** Whether the session is still working on this turn. */
  isWorking: boolean
  expanded: boolean
  onToggle: () => void
  renderMessage: (message: ChatMessageEntry) => React.ReactNode
}

export function LiveTurnActivity({
  turn,
  hasLaterAssistant,
  isWorking,
  expanded,
  onToggle,
  renderMessage,
}: LiveTurnActivityProps) {
  const { t } = useI18n()
  const contentId = React.useId()
  const finalContentId = React.useId()
  const finalMessage = getLiveFinalMessage(turn.assistantMessages)
  const activityMessages = React.useMemo(
    () =>
      finalMessage ? turn.assistantMessages.filter((message) => message !== finalMessage) : turn.assistantMessages,
    [finalMessage, turn.assistantMessages],
  )
  // A turn that ended without a text answer (an error, an abort, tools only)
  // settles once the session stops working on it and none of its messages is
  // still open. The session reads as not working while a permission or
  // question waits, but the open message keeps the turn live then.
  const settled = Boolean(finalMessage) || hasLaterAssistant || (!isWorking && !turn.stream.isStreaming)
  const isExpanded = !settled || expanded
  // One toggle for the whole turn. Folded, a working turn shows only its
  // latest rows (the header counts the earlier ones) and a settled one shows
  // none; opened, both show every row. The trim also stays while a settled
  // fold closes, so its content does not change under the animation.
  const showReasoningTraces = useUIStore((state) => state.showReasoningTraces)
  const collapsibleThinkingBlocks = useUIStore((state) => state.collapsibleThinkingBlocks)
  const groupReasoningBlocks = useUIStore((state) => state.groupReasoningBlocks)
  const trimRows = !expanded
  const trim = React.useMemo(
    () =>
      trimRows
        ? planActivityTrim(
            activityMessages.map((message) =>
              countActivityRows(message.parts, {
                showReasoningTraces,
                collapsibleThinkingBlocks,
                groupReasoningBlocks,
              }),
            ),
            LIVE_ACTIVITY_VISIBLE_ROWS,
          )
        : null,
    [activityMessages, collapsibleThinkingBlocks, groupReasoningBlocks, showReasoningTraces, trimRows],
  )
  const shownMessages = React.useMemo(
    () => (trim && trim.hiddenMessages > 0 ? activityMessages.slice(trim.hiddenMessages) : activityMessages),
    [activityMessages, trim],
  )
  const skippedMessageId = trim && trim.skipRows > 0 ? shownMessages[0]?.info.id : undefined
  const skippedRows = trim?.skipRows ?? 0
  const rowSkip = React.useMemo(
    () => (skippedMessageId ? { messageId: skippedMessageId, rows: skippedRows } : null),
    [skippedMessageId, skippedRows],
  )
  const hiddenRows = trim?.hiddenRows ?? 0
  const rowsRef = React.useRef<HTMLDivElement>(null)
  useActivityRowGlide(rowsRef, hiddenRows, !settled && !expanded)
  const previouslySettled = React.useRef(settled)
  const animateFinalCollapse = settled && !previouslySettled.current
  React.useLayoutEffect(() => {
    previouslySettled.current = settled
  }, [settled])
  const finalContext = React.useMemo(
    () =>
      finalMessage
        ? {
            messageId: finalMessage.info.id,
            expanded: isExpanded,
            contentId: finalContentId,
            animateCollapse: animateFinalCollapse,
            hasEarlierActivity: activityMessages.length > 0,
          }
        : null,
    [finalMessage, isExpanded, finalContentId, animateFinalCollapse, activityMessages.length],
  )
  // No diff parsing while tokens stream. The report is shown once the turn settles.
  const summary = React.useMemo(() => (settled ? summarizeLiveActivity(turn) : null), [settled, turn])
  const fileLabel =
    summary && summary.files > 0
      ? t(summary.files === 1 ? "chat.liveActivity.changedFile" : "chat.liveActivity.changedFiles", {
          count: summary.files,
        })
      : null
  const details = summary
    ? [
        summary.explored ? t("chat.liveActivity.explored") : null,
        summary.commands > 0
          ? t(summary.commands === 1 ? "chat.liveActivity.ranCommand" : "chat.liveActivity.ranCommands", {
              count: summary.commands,
            })
          : null,
        summary.researched ? t("chat.liveActivity.researched") : null,
        summary.subagents > 0
          ? t(summary.subagents === 1 ? "chat.liveActivity.usedSubagent" : "chat.liveActivity.usedSubagents", {
              count: summary.subagents,
            })
          : null,
      ]
        .filter((item): item is string => Boolean(item))
        .join(" · ")
    : ""
  const label = (
    <>
      <Icon name="stack" className="size-3.5 shrink-0 text-[var(--tools-icon)]" />
      <span className="shrink-0 font-semibold text-[var(--tools-title)]">{t("chat.liveActivity.title")}</span>
      <Icon name={isExpanded ? "arrow-down-s" : "arrow-right-s"} className="size-3 shrink-0" />
      {fileLabel ? (
        <span className="flex min-w-0 items-center gap-1 typography-meta @min-[560px]:shrink-0">
          <span className="truncate">{fileLabel}</span>
          {summary?.hasDiff && (summary.additions > 0 || summary.deletions > 0) ? (
            <span className="shrink-0 tabular-nums">
              <span className="text-[var(--status-success)]">+{summary.additions}</span>
              <span aria-hidden="true">/</span>
              <span className="text-[var(--status-error)]">-{summary.deletions}</span>
            </span>
          ) : null}
        </span>
      ) : null}
      {details ? (
        <span className="hidden min-w-0 flex-1 truncate text-start typography-meta @min-[560px]:inline" title={details}>
          {fileLabel ? "· " : ""}
          {details}
        </span>
      ) : null}
      {!settled && hiddenRows > 0 ? (
        <span className="shrink-0 typography-meta">{t("chat.liveActivity.moreRows", { count: hiddenRows })}</span>
      ) : null}
    </>
  )
  const headerClass =
    "w-full justify-start normal-case !ps-px !pe-2 text-[var(--tools-description)] hover:!bg-transparent active:!bg-transparent"
  return (
    <div className="relative z-0" data-live-turn-activity={turn.turnId}>
      <div className="chat-message-column @container">
        <div className="mt-1">
          <Button
            variant="ghost"
            size="sm"
            className={headerClass}
            onClick={onToggle}
            aria-expanded={isExpanded}
            aria-controls={finalMessage ? `${contentId} ${finalContentId}` : contentId}
          >
            {label}
          </Button>
        </div>
      </div>
      <LiveActivityCollapse expanded={isExpanded} id={contentId}>
        <div ref={rowsRef}>
          <ActivityRowSkipContext.Provider value={rowSkip}>
            {shownMessages.map(renderMessage)}
          </ActivityRowSkipContext.Provider>
        </div>
      </LiveActivityCollapse>
      <LiveFinalActivityContext.Provider value={finalContext}>
        {finalMessage ? renderMessage(finalMessage) : null}
      </LiveFinalActivityContext.Provider>
    </div>
  )
}
