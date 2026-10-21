import React from "react"

import { Icon } from "@/components/icon/Icon"
import { useI18n, type I18nKey } from "@/lib/i18n"
import { collectWebMcpCalls } from "@/lib/webMcpCalls"
import { truncateToCodeUnits } from "@/lib/textTruncate"
import { cn } from "@/lib/utils"
import { useUIStore } from "@/stores/useUIStore"
import { useWebMcpBrowserValue } from "@/hooks/useWebMcpBrowser"
import { viewKeyFor } from "@/lib/webMcpViewKey"
import { useDirectorySync, useSessionMessages } from "@/sync/sync-context"

/**
 * What the agent did on the page: its recent page-tool calls with redacted arguments and outcome, from the session's
 * transcript. A plain browser pane cannot show this; it makes the agent's use of the web app reviewable at a glance.
 */
export function WebMcpCallStrip({ sessionID, directory }: { sessionID: string; directory: string }) {
  const { t } = useI18n()
  const messages = useSessionMessages(sessionID, directory)
  // The parts map changes on every streamed token. The selector returns a string, so the strip only re-renders when the
  // recent WebMCP calls actually change, and it scans only the newest messages.
  const signature = useDirectorySync(
    React.useCallback(
      (state: { part: Map<string, unknown[]> }) =>
        JSON.stringify(collectWebMcpCalls(messages as never, (id) => state.part.get(id) as never)),
      [messages],
    ) as never,
    directory,
  ) as unknown as string
  const calls = React.useMemo(() => JSON.parse(signature) as ReturnType<typeof collectWebMcpCalls>, [signature])
  const [open, setOpen] = React.useState(true)
  const generation = useWebMcpBrowserValue(
    (state) => (state.sessionID === sessionID ? state.generation : null),
    viewKeyFor(directory, sessionID),
  )
  const openInTranscript = useUIStore((state) => state.setPendingMessageNavigation)
  if (calls.length === 0) return null
  const failed = calls.filter((call) => call.outcome === "failed").length
  return (
    <section aria-label={t("webmcp.calls.title")} className="border-b border-border/40" data-webmcp-call-strip>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1 text-left typography-meta text-muted-foreground hover:text-foreground"
      >
        <Icon name={open ? "arrow-down-s" : "arrow-right-s"} className="h-3.5 w-3.5" aria-hidden="true" />
        {t("webmcp.calls.toggle", { count: calls.length })}
        {failed > 0 ? (
          <span className="text-[var(--status-error)]">· {t("webmcp.calls.failedCount", { count: failed })}</span>
        ) : null}
      </button>
      {/* Announce only a change in failures, not every streamed update of the list. */}
      <span className="sr-only" role="status" aria-live="polite">
        {failed > 0 ? t("webmcp.calls.failedCount", { count: failed }) : ""}
      </span>
      {open ? (
        <ol className="max-h-48 space-y-1 overflow-auto px-2.5 pb-2">
          {calls.map((call) => (
            <li key={call.id} data-webmcp-call={call.outcome}>
              <button
                type="button"
                onClick={() => openInTranscript({ sessionId: sessionID, messageId: call.messageId })}
                aria-label={t("webmcp.calls.open", { title: truncateToCodeUnits(call.title, 80) })}
                className="flex w-full min-w-0 items-start gap-2 rounded border border-border/50 px-2 py-1 text-left hover:bg-interactive-hover/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)]"
              >
                <span
                  className={cn(
                    "mt-1 h-1.5 w-1.5 shrink-0 rounded-full",
                    call.outcome === "failed"
                      ? "bg-[var(--status-error)]"
                      : call.outcome === "ok"
                        ? "bg-[var(--status-success)]"
                        : "bg-[var(--status-info)]",
                  )}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {/* Tool names come from the page: capped, and isolated so bidirectional text cannot reorder the row. */}
                    <span
                      className="truncate font-mono typography-meta text-foreground"
                      style={{ unicodeBidi: "isolate" }}
                      title={call.title}
                    >
                      {truncateToCodeUnits(call.title, 80)}
                    </span>
                    <span className="shrink-0 typography-micro text-muted-foreground">
                      {t(`webmcp.calls.outcome.${call.outcome}` as I18nKey)}
                      {call.durationMs !== null ? ` · ${formatDuration(call.durationMs)}` : null}
                    </span>
                    {/* The page generation changes on a reload and when agent access pauses or reconnects, so this marks calls
                      made against an earlier page state, whose results may not match what is shown now. */}
                    {call.generation && generation && call.generation !== generation ? (
                      <span className="shrink-0 typography-micro text-muted-foreground" data-webmcp-call-earlier>
                        {t("webmcp.calls.earlierPage")}
                      </span>
                    ) : null}
                  </span>
                  {call.argumentsText ? (
                    <span className="block truncate font-mono typography-micro text-muted-foreground">
                      {call.argumentsText.length > 140 ? `${call.argumentsText.slice(0, 140)}…` : call.argumentsText}
                    </span>
                  ) : null}
                  {call.resultPreview ? (
                    <span
                      className="block truncate font-mono typography-micro text-muted-foreground"
                      data-webmcp-call-result
                    >
                      {t("webmcp.calls.result", { preview: call.resultPreview })}
                    </span>
                  ) : null}
                  {call.failureReason ? (
                    <span className="block typography-micro text-[var(--status-error)]">
                      {t(`chat.toolPart.webmcp.reason.${call.failureReason}` as I18nKey)}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  )
}

/** "320 ms", "1.4 s", "2 min": enough to see a slow call at a glance. */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`
  return `${Math.round(ms / 60_000)} min`
}
