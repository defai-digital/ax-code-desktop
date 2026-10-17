import React from "react"

import { Icon } from "@/components/icon/Icon"
import { toast } from "@/components/ui"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import * as sessionActions from "@/sync/session-actions"
import { isInlineAnswerableQuestion } from "@/lib/supervision/requests"
import type { PendingRequestEntry } from "@/sync/sync-context"
import { RequestRiskBadge } from "@/components/chat/RequestRiskBadge"

type RequestActionCardProps = {
  entry: PendingRequestEntry
  /** Session title and project shown above the request; omit inside a session. */
  context?: string | null
  density?: "compact" | "full"
  onOpen?: () => void
  className?: string
}

const MAX_PATTERNS = 2

/**
 * The one actionable request card for cross-session surfaces (titlebar popover, Needs You queue, Mission
 * Control peek). It sends intents only: allow once, deny, answer, dismiss. Standing "always" grants stay in
 * the in-session permission card, where the patterns they save are shown in full.
 */
export const RequestActionCard: React.FC<RequestActionCardProps> = ({
  entry,
  context,
  density = "full",
  onOpen,
  className,
}) => {
  const { t } = useI18n()
  const [busy, setBusy] = React.useState(false)
  const mountedRef = React.useRef(true)
  React.useEffect(
    () => () => {
      mountedRef.current = false
    },
    [],
  )

  const run = React.useCallback(
    async (action: () => Promise<void>, failureTitle: string) => {
      if (busy) return
      setBusy(true)
      try {
        await action()
      } catch (error) {
        toast.error(failureTitle, {
          description: error instanceof Error ? error.message : t("chat.permissionCard.responseFailed.retry"),
        })
      } finally {
        if (mountedRef.current) setBusy(false)
      }
    },
    [busy, t],
  )

  const compact = density === "compact"
  const isPermission = entry.kind === "permission"
  const title = isPermission
    ? t("notificationCenter.permission.requestTitle", { tool: entry.request.permission })
    : entry.request.questions?.[0]?.header?.trim() || entry.request.questions?.[0]?.question || ""
  const detail = isPermission
    ? entry.request.patterns.filter(Boolean).slice(0, MAX_PATTERNS).join(" · ")
    : entry.request.questions?.[0]?.header
      ? entry.request.questions[0].question
      : ""
  const inlineQuestion = isInlineAnswerableQuestion(entry) && entry.kind === "question" ? entry.request : null

  return (
    <div
      data-request-kind={entry.kind}
      className={cn(
        "flex min-w-0 flex-col gap-1.5 rounded-lg border border-border/60 bg-[var(--surface-elevated)]",
        compact ? "px-2.5 py-2" : "px-3 py-2.5",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-2">
        <Icon
          name={isPermission ? "shield-warning" : "question"}
          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--status-warning)]"
          aria-hidden="true"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {context ? <span className="truncate typography-micro text-muted-foreground">{context}</span> : null}
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate typography-ui-label font-medium text-foreground">{title}</span>
            {entry.kind === "permission" ? <RequestRiskBadge request={entry.request} /> : null}
          </span>
          {detail ? (
            <span className={cn("typography-micro text-muted-foreground", compact ? "truncate" : "line-clamp-2")}>
              {detail}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 pl-5">
        {entry.kind === "permission" ? (
          <>
            <Button
              size="sm"
              variant="default"
              className="h-6 px-2 typography-micro"
              disabled={busy}
              onClick={() =>
                void run(
                  () => sessionActions.respondToPermission(entry.sessionId, entry.request.id, "once"),
                  t("chat.permissionCard.responseFailed.title"),
                )
              }
            >
              {t("notificationCenter.allow")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 typography-micro"
              disabled={busy}
              onClick={() =>
                void run(
                  () => sessionActions.respondToPermission(entry.sessionId, entry.request.id, "reject"),
                  t("chat.permissionCard.responseFailed.title"),
                )
              }
            >
              {t("notificationCenter.deny")}
            </Button>
          </>
        ) : inlineQuestion ? (
          <>
            {inlineQuestion.questions[0].options.map((option) => (
              <Button
                key={option.label}
                size="sm"
                variant="outline"
                className="h-6 max-w-full truncate px-2 typography-micro"
                title={option.description || option.label}
                disabled={busy}
                onClick={() =>
                  void run(
                    () => sessionActions.respondToQuestion(entry.sessionId, entry.request.id, [[option.label]]),
                    t("supervision.request.answerFailed"),
                  )
                }
              >
                {option.label}
              </Button>
            ))}
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 typography-micro"
              disabled={busy}
              onClick={() =>
                void run(
                  () => sessionActions.rejectQuestion(entry.sessionId, entry.request.id),
                  t("supervision.request.answerFailed"),
                )
              }
            >
              {t("supervision.request.dismiss")}
            </Button>
          </>
        ) : null}
        {onOpen ? (
          <Button size="sm" variant="ghost" className="h-6 px-2 typography-micro" onClick={onOpen}>
            {t("supervision.request.open")}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
