import React from "react"

import { Icon } from "@/components/icon/Icon"
import { Button } from "@/components/ui/button"
import { useAutoOnceSeconds } from "@/hooks/useAutoOnceSeconds"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import {
  checkRequestDecision,
  requestDecisionKey,
  retainRequestDecision,
  submitRequestDecision,
  useRequestDecisionStore,
} from "@/stores/useRequestDecisionStore"
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
  const identity = { kind: entry.kind, sessionId: entry.sessionId, requestId: entry.request.id }
  const requestKey = requestDecisionKey(identity)
  // The runtime answers an unattended ask "once" itself; the label counts down to it, as in the session's own card.
  const autoOnceSeconds = useAutoOnceSeconds(
    entry.kind === "permission" ? entry.request.autoOnceAt : undefined,
    entry.request.id,
  )
  const phase = useRequestDecisionStore((state) => state.records.get(requestKey)?.phase ?? "idle")
  const busy = phase !== "idle" && phase !== "retry"
  const [expandedRequest, setExpandedRequest] = React.useState<string | null>(null)
  const scopeId = React.useId()
  React.useEffect(() => retainRequestDecision(requestKey), [requestKey])

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
      data-request-status={phase}
      aria-busy={phase === "sending" || phase === "checking"}
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
              className="min-h-8 max-w-full whitespace-normal rounded text-left text-foreground underline underline-offset-4 [overflow-wrap:anywhere] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="empty:hidden pl-5 typography-meta text-muted-foreground [overflow-wrap:anywhere]"
      >
        {phase !== "idle" ? t(`supervision.request.status.${phase}`) : null}
      </p>
      {phase === "uncertain" ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="self-start ml-5 whitespace-normal h-auto min-h-8"
          onClick={() => void checkRequestDecision(identity)}
        >
          {t("supervision.request.checkStatus")}
        </Button>
      ) : null}
      <div className="flex flex-wrap items-center gap-1.5 pl-5">
        {entry.kind === "permission" ? (
          <>
            <Button
              size="sm"
              variant="default"
              className="h-auto min-h-8 max-w-full whitespace-normal px-2 py-1 typography-micro"
              disabled={busy}
              onClick={() => void submitRequestDecision(identity, "once")}
            >
              {autoOnceSeconds === null
                ? t("supervision.request.allowOnce")
                : t("chat.permissionCard.actions.allowOnceCountdown", { seconds: autoOnceSeconds })}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-auto min-h-8 max-w-full whitespace-normal px-2 py-1 typography-micro"
              disabled={busy}
              onClick={() => void submitRequestDecision(identity, "reject")}
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
                className="h-auto min-h-8 max-w-full whitespace-normal px-2 py-1 typography-micro"
                title={option.description || option.label}
                disabled={busy}
                onClick={() => void submitRequestDecision(identity, [[option.label]])}
              >
                {option.label}
              </Button>
            ))}
            <Button
              size="sm"
              variant="ghost"
              className="h-auto min-h-8 max-w-full whitespace-normal px-2 py-1 typography-micro"
              disabled={busy}
              onClick={() => void submitRequestDecision(identity, "reject")}
            >
              {t("supervision.request.dismiss")}
            </Button>
          </>
        ) : null}
        {onOpen ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-auto min-h-8 max-w-full whitespace-normal px-2 py-1 typography-micro"
            onClick={onOpen}
          >
            {t("supervision.request.open")}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
