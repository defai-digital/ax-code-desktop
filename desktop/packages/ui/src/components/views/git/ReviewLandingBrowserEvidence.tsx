import { viewKeyFor } from "@/lib/webMcpViewKey"
import React from "react"

import { Icon } from "@/components/icon/Icon"
import { useI18n } from "@/lib/i18n"
import type { I18nKey } from "@/lib/i18n/store"
import { truncateToCodeUnits } from "@/lib/textTruncate"
import { collectWebMcpCalls, latestTurnMessages, type WebMcpCall } from "@/lib/webMcpCalls"
import { useWebMcpBrowserStore } from "@/stores/useWebMcpBrowserStore"
import { useDirectorySync, useSessionMessages } from "@/sync/sync-context"

/** Steps listed in the recap. The counts cover what the scan reads: the latest turn within its message window, up to 200 calls. */
const RECAP_LIMIT = 50
const RECAP_KINDS = new Set(["invoke", "act", "read", "navigate", "list"])

type RecapCall = Pick<WebMcpCall, "id" | "title" | "toolName" | "operation" | "outcome" | "failureReason">

/**
 * Beside the landing action: how the agent exercised the web app in the browser during its latest turn, so landing can weigh
 * what was actually tried. The recap lists each step, how it was done and how it ended, plus the current page's tools the agent
 * never called. It reports calls, never test results or verification.
 */
export function ReviewLandingBrowserEvidence({ directory, sessionId }: { directory: string; sessionId: string }) {
  const { t } = useI18n()
  const messages = useSessionMessages(sessionId, directory)
  const requestAgentMode = useWebMcpBrowserStore((state) => state.requestAgentMode)
  // Tools of the page this session's browser shows; another session's page must never be read as "not called" here.
  const pageTools = useWebMcpBrowserStore(
    (state) =>
      state.views[viewKeyFor(directory, sessionId)]?.catalog ??
      (state.order.length === 0 && state.sessionID === sessionId ? state.catalog : null),
  )
  // A string selector: streamed tokens re-render nothing unless the latest turn's calls change.
  const serialized = useDirectorySync(
    React.useCallback(
      (state: { part: Map<string, unknown[]> }) => {
        const calls = collectWebMcpCalls(
          latestTurnMessages(messages) as never,
          (id) => state.part.get(id) as never,
          200,
        )
        const recap: RecapCall[] = calls.map(({ id, title, toolName, operation, outcome, failureReason }) => ({
          id,
          title,
          toolName,
          operation,
          outcome,
          failureReason,
        }))
        return JSON.stringify(recap)
      },
      [messages],
    ) as never,
    directory,
  ) as unknown as string
  const calls = React.useMemo(() => JSON.parse(serialized) as RecapCall[], [serialized])
  if (calls.length === 0) return null
  const failed = calls.filter((call) => call.outcome === "failed").length
  const called = new Set(calls.map((call) => call.toolName).filter(Boolean))
  const notCalled = calls.some((call) => call.operation?.toLowerCase() === "invoke")
    ? [...new Set((pageTools ?? []).map((tool) => tool.name))].filter((name) => !called.has(name))
    : []
  // Oldest first reads as the order the agent worked in.
  const steps = calls.slice(0, RECAP_LIMIT).reverse()
  return (
    <div className="min-w-0" data-landing-browser-recap>
      <button
        type="button"
        onClick={() => requestAgentMode(undefined, viewKeyFor(directory, sessionId))}
        data-landing-browser-evidence={failed > 0 ? "failed" : "ok"}
        className="inline-flex min-w-0 items-center gap-1.5 rounded border border-border/60 px-2 py-1 typography-micro text-muted-foreground hover:text-foreground"
        title={t("diffView.landing.browserEvidenceHint")}
      >
        <Icon name="ax-browser" className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">
          {t(failed > 0 ? "diffView.landing.browserEvidenceFailed" : "diffView.landing.browserEvidence", {
            count: calls.length,
            failed,
          })}
        </span>
      </button>
      <details className="mt-1 typography-micro text-muted-foreground">
        <summary className="cursor-pointer">{t("diffView.landing.browserRecap.title")}</summary>
        <p className="mt-1">{t("diffView.landing.browserEvidenceHint")}</p>
        <ol className="mt-1 max-h-40 space-y-0.5 overflow-auto" tabIndex={0}>
          {steps.map((call) => {
            const operation = call.operation?.toLowerCase() ?? ""
            const kind = RECAP_KINDS.has(operation) ? operation : "other"
            return (
              <li key={call.id} className="break-words" data-recap-outcome={call.outcome}>
                {/* Tool names come from the page: capped, and isolated so bidirectional text cannot reorder the line. */}
                <span className="font-mono text-foreground" style={{ unicodeBidi: "isolate" }} title={call.title}>
                  {truncateToCodeUnits(call.title, 80)}
                </span>
                {" · "}
                {t(`diffView.landing.browserRecap.kind.${kind}` as I18nKey)}
                {" · "}
                <span className={call.outcome === "failed" ? "text-[var(--status-error)]" : undefined}>
                  {t(`webmcp.calls.outcome.${call.outcome}` as I18nKey)}
                </span>
                {call.outcome === "failed" && call.failureReason
                  ? ` · ${t(`chat.toolPart.webmcp.reason.${call.failureReason}` as I18nKey)}`
                  : null}
              </li>
            )
          })}
        </ol>
        {notCalled.length > 0 ? (
          <p className="mt-1" data-recap-not-called>
            {t("diffView.landing.browserRecap.notCalled", { names: notCalled.join(", ") })}
          </p>
        ) : null}
      </details>
    </div>
  )
}
