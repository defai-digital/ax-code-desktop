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

const PREVIEW_PATTERNS = 2
const PREVIEW_CHARACTERS = 160

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
  const respondingRef = React.useRef(false)
  const [expandedRequest, setExpandedRequest] = React.useState<string | null>(null)
  const requestKey = `${entry.sessionId}:${entry.kind}:${entry.request.id}`
  const scopeId = React.useId()
  const mountedRef = React.useRef(true)
  React.useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const run = React.useCallback(
    async (action: () => Promise<void>, failureTitle: string) => {
      if (respondingRef.current) return
      respondingRef.current = true
      setBusy(true)
      try {
        await action()
      } catch (error) {
        toast.error(failureTitle, {
          description: error instanceof Error ? error.message : t("chat.permissionCard.responseFailed.retry"),
        })
      } finally {
        respondingRef.current = false
        if (mountedRef.current) setBusy(false)
      }
    },
    [t],
  )

  const compact = density === "compact"
  const isPermission = entry.kind === "permission"
  const title = isPermission
    ? t("notificationCenter.permission.requestTitle", { tool: entry.request.permission })
    : entry.request.questions?.[0]?.header?.trim() || entry.request.questions?.[0]?.question || ""
  const patterns = entry.kind === "permission" ? entry.request.patterns.filter(Boolean) : []
  const needsExpansion =
    patterns.length > PREVIEW_PATTERNS || patterns.some((pattern) => pattern.length > PREVIEW_CHARACTERS)
  const expanded = expandedRequest === requestKey
  const detail =
    entry.kind === "question" && entry.request.questions?.[0]?.header ? entry.request.questions[0].question : ""
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
      {patterns.length > 0 ? (
        <div className="min-w-0 pl-5 typography-meta">
          {needsExpansion ? (
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={scopeId}
              onClick={(event) => {
                event.stopPropagation()
                setExpandedRequest(expanded ? null : requestKey)
              }}
              className="min-h-8 rounded text-left text-foreground underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t("supervision.request.scopeCount", { count: patterns.length })}
              <Icon
                name={expanded ? "arrow-up-s" : "arrow-down-s"}
                className="ml-1 inline h-4 w-4"
                aria-hidden="true"
              />
            </button>
          ) : null}
          <ul id={scopeId} className="space-y-1 text-muted-foreground">
            {(expanded || !needsExpansion ? patterns : patterns.slice(0, PREVIEW_PATTERNS)).map((pattern, index) => (
              <li key={index} className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                <code>
                  {expanded || !needsExpansion || pattern.length <= PREVIEW_CHARACTERS
                    ? pattern
                    : `${pattern.slice(0, PREVIEW_CHARACTERS)}…`}
                </code>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-1.5 pl-5">
        {entry.kind === "permission" ? (
          <>
            <Button
              size="sm"
              variant="default"
              className="min-h-8 px-2 typography-micro"
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
              className="min-h-8 px-2 typography-micro"
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
                className="min-h-8 max-w-full truncate px-2 typography-micro"
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
              className="min-h-8 px-2 typography-micro"
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
          <Button size="sm" variant="ghost" className="min-h-8 px-2 typography-micro" onClick={onOpen}>
            {t("supervision.request.open")}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
