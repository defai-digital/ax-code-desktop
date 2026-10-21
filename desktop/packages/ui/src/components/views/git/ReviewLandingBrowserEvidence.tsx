import React from "react"

import { Icon } from "@/components/icon/Icon"
import { useI18n } from "@/lib/i18n"
import { collectWebMcpCalls, latestTurnMessages } from "@/lib/webMcpCalls"
import { useWebMcpBrowserStore } from "@/stores/useWebMcpBrowserStore"
import { useDirectorySync, useSessionMessages } from "@/sync/sync-context"

/**
 * Beside the landing action: how the agent exercised the web app in the browser during its latest turn (page-tool calls and
 * failures), so landing can weigh what was actually tried. It reports calls, never test results or verification.
 */
export function ReviewLandingBrowserEvidence({ directory, sessionId }: { directory: string; sessionId: string }) {
  const { t } = useI18n()
  const messages = useSessionMessages(sessionId, directory)
  const requestAgentMode = useWebMcpBrowserStore((state) => state.requestAgentMode)
  // Counts only, as a string selector: streamed tokens re-render nothing unless the latest turn's calls change.
  const summary = useDirectorySync(
    React.useCallback(
      (state: { part: Map<string, unknown[]> }) => {
        const calls = collectWebMcpCalls(latestTurnMessages(messages) as never, (id) => state.part.get(id) as never, 200)
        return `${calls.length}:${calls.filter((call) => call.outcome === "failed").length}`
      },
      [messages],
    ) as never,
    directory,
  ) as unknown as string
  const [total, failed] = summary.split(":").map(Number)
  const calls = { length: total }
  if (calls.length === 0) return null
  return (
    <button
      type="button"
      onClick={() => requestAgentMode()}
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
  )
}
