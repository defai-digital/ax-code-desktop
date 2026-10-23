import { useWebMcpApprovalReceipts } from "@/stores/useWebMcpApprovalOutcome"
import { WebMcpCallDiagnosis } from "@/components/mcp/WebMcpCallDiagnosis"
import { webMcpKnownDefinitions, webMcpToolIdentity } from "@/lib/webMcpCatalog"
import { webMcpCallOutcomeKey } from "@/lib/webMcpCalls"
import { redactWebMcpText } from "../../../../../../shared/webmcp-redaction.mjs"
import { viewKeyFor } from "@/lib/webMcpViewKey"
import React from "react"

import { Icon } from "@/components/icon/Icon"
import { useI18n } from "@/lib/i18n"
import type { I18nKey } from "@/lib/i18n/store"
import { truncateToCodeUnits } from "@/lib/textTruncate"
import { collectWebMcpCalls, formatWebMcpDuration, latestTurnMessages, type WebMcpCall } from "@/lib/webMcpCalls"
import { useUIStore } from "@/stores/useUIStore"
import { useWebMcpBrowserStore } from "@/stores/useWebMcpBrowserStore"
import { useDirectorySync, useSessionMessages } from "@/sync/sync-context"
import { fingerprintWebMcpRecap, sameWebMcpRecapFingerprint } from "./reviewLandingBrowserRecap"

/** Only the displayed steps are capped; counts and called-tool sets cover the whole latest turn. */
const RECAP_LIMIT = 50
const RECAP_KINDS = new Set(["invoke", "act", "read", "navigate", "list"])

type RecapCall = WebMcpCall

/** A short digest label; full digests stay in the tooltip. */
const shortDigest = (digest: string) => digest.slice(0, 8)

/**
 * Beside the landing action: how the agent exercised the web app in the browser during its latest turn, so landing can weigh
 * what was actually tried. The recap lists each step, how it was done and how it ended, plus the current page's tools the agent
 * never called. It reports calls, never test results or verification.
 */
export function ReviewLandingBrowserEvidence({ directory, sessionId }: { directory: string; sessionId: string }) {
  const { t } = useI18n()
  const receipts = useWebMcpApprovalReceipts((state) => state.receipts)
  const messages = useSessionMessages(sessionId, directory)
  const requestAgentMode = useWebMcpBrowserStore((state) => state.requestAgentMode)
  // Tools of the page this session's browser shows; another session's page must never be read as "not called" here.
  const pageView = useWebMcpBrowserStore(
    (state) =>
      state.views[viewKeyFor(directory, sessionId)] ??
      (state.order.length === 0 && state.sessionID === sessionId ? state : null),
  )
  const pageTools = pageView?.catalog
  const definitions = React.useMemo(() => webMcpKnownDefinitions(pageView), [pageView])
  // Directory updates run this selector even for a text token. The same webmcp
  // callID, status, and output identity returns the previous string, so those
  // tokens do not parse or redact the tool outputs again.
  const recapCacheRef = React.useRef<{
    fingerprint: ReturnType<typeof fingerprintWebMcpRecap>
    serialized: string
    definitions: typeof definitions
    receipts: typeof receipts
    sessionId: string
  } | null>(null)
  const serialized = useDirectorySync(
    React.useCallback(
      (state: { part: Map<string, unknown[]> }) => {
        const turn = latestTurnMessages(messages, Infinity)
        const fingerprint = fingerprintWebMcpRecap(turn, (id) => state.part.get(id))
        const cached = recapCacheRef.current
        if (
          cached &&
          cached.definitions === definitions &&
          cached.receipts === receipts &&
          cached.sessionId === sessionId &&
          sameWebMcpRecapFingerprint(cached.fingerprint, fingerprint)
        ) {
          return cached.serialized
        }
        const calls = collectWebMcpCalls(
          turn as never,
          (id) => state.part.get(id) as never,
          Infinity,
          Infinity,
          definitions,
          receipts,
          sessionId,
        )
        const next = JSON.stringify(calls)
        recapCacheRef.current = { fingerprint, serialized: next, definitions, receipts, sessionId }
        return next
      },
      [messages, definitions, receipts, sessionId],
    ) as never,
    directory,
  ) as unknown as string
  const calls = React.useMemo(() => JSON.parse(serialized ?? "[]") as RecapCall[], [serialized])
  const openCall = useUIStore((state) => state.setPendingMessageNavigation)
  const [copied, setCopied] = React.useState(false)
  if (calls.length === 0 && !pageTools?.length) return null
  const failed = calls.filter((call) => call.outcome === "failed").length
  // A known earlier version was still called; its digest change is reported separately below.
  const called = new Set(calls.filter((call) => call.operation?.toLowerCase() === "invoke" &&
    webMcpToolIdentity({ invocationID: call.invocationID, definitionDigest: call.definitionDigest ?? undefined }))
    .map((call) => call.invocationID))
  const associationUnknown = calls.some((call) => call.operation?.toLowerCase() === "invoke" && !call.invocationID)
  const notCalled = !associationUnknown
    ? (pageTools ?? []).filter((tool) => tool.invocationID && !called.has(tool.invocationID)).map((tool) => tool.name)
    : []
  // Oldest first reads as the order the agent worked in.
  const steps = calls.slice(0, RECAP_LIMIT).reverse()
  // The definition each tool has now, to show when a call ran against an earlier one.
  const currentDigest = new Map((pageTools ?? []).flatMap((tool) => (tool.definitionDigest ? [[tool.invocationID, tool.definitionDigest]] : [])))
  // The copied recap is the whole turn; only the on-screen list is capped.
  const recapText = () =>
    [...calls]
      .reverse()
      .map((call, index) => {
        const operation = call.operation?.toLowerCase() ?? ""
        const kind = t(`diffView.landing.browserRecap.kind.${RECAP_KINDS.has(operation) ? operation : "other"}` as I18nKey)
        const parts = [`${index + 1}. ${call.title}`, kind, t(webMcpCallOutcomeKey(call.outcome))]
        if (call.durationMs !== null) parts.push(formatWebMcpDuration(call.durationMs))
        if (call.outcome === "failed" && call.failureReason)
          parts.push(t(`chat.toolPart.webmcp.reason.${call.failureReason}` as I18nKey))
        if (call.definitionDigest) {
          parts.push(t("diffView.landing.browserRecap.definition", { digest: shortDigest(call.definitionDigest) }))
          if (call.invocationID && currentDigest.has(call.invocationID) && currentDigest.get(call.invocationID) !== call.definitionDigest)
            parts.push(t("diffView.landing.browserRecap.definitionChanged"))
        }
        for (const rejection of call.rejections ?? []) parts.push(t("webmcp.tools.diagnosis.runtimeRejection", {
          reason: [rejection.property, rejection.rule, rejection.text].filter(Boolean).join(" · "),
        }))
        if (call.resultPreview) parts.push(call.resultPreview)
        return parts.join(" · ")
      })
      .join("\n")
  const copyRecap = async () => {
    try {
      await navigator.clipboard.writeText([t("diffView.landing.browserRecap.title"), t(failed > 0 ? "diffView.landing.browserEvidenceFailed" : "diffView.landing.browserEvidence", { count: calls.length, failed }), recapText(), ...(associationUnknown ? [t("diffView.landing.browserRecap.unknownAssociation")] : []), ...(notCalled.length ? [t("diffView.landing.browserRecap.notCalled", { names: notCalled.map(redactWebMcpText).join(", ") })] : [])].join("\n"))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }
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
        <ol start={calls.length - steps.length + 1} className="mt-1 max-h-40 space-y-0.5 overflow-auto" tabIndex={0}>
          {steps.map((call) => {
            const operation = call.operation?.toLowerCase() ?? ""
            const kind = RECAP_KINDS.has(operation) ? operation : "other"
            return (
              <li key={call.id} className="break-words" data-recap-outcome={call.outcome}>
                {/* Tool names come from the page: capped, and isolated so bidirectional text cannot reorder the line. */}
                <button
                  type="button"
                  className="font-mono text-foreground hover:underline"
                  style={{ unicodeBidi: "isolate" }}
                  title={call.title}
                  aria-label={t("webmcp.calls.open", { title: truncateToCodeUnits(call.title, 80) })}
                  onClick={() =>
                    openCall({ sessionId, messageId: call.messageId, partId: call.partId ?? undefined })
                  }
                  data-recap-open
                >
                  {truncateToCodeUnits(call.title, 80)}
                </button>
                {" · "}
                {t(`diffView.landing.browserRecap.kind.${kind}` as I18nKey)}
                {" · "}
                <span className={call.outcome === "failed" ? "text-[var(--status-error)]" : undefined}>
                  {t(webMcpCallOutcomeKey(call.outcome))}
                </span>
                {call.outcome === "failed" && call.failureReason
                  ? ` · ${t(`chat.toolPart.webmcp.reason.${call.failureReason}` as I18nKey)}`
                  : null}
                {call.durationMs !== null ? ` · ${formatWebMcpDuration(call.durationMs)}` : null}
                {call.definitionDigest ? (
                  <span title={call.definitionDigest} data-recap-definition>
                    {" · "}
                    {t("diffView.landing.browserRecap.definition", { digest: shortDigest(call.definitionDigest) })}
                    {call.invocationID &&
                    currentDigest.has(call.invocationID) &&
                    currentDigest.get(call.invocationID) !== call.definitionDigest ? (
                      <span className="text-[var(--status-warning)]" data-recap-definition-changed>
                        {" "}
                        {t("diffView.landing.browserRecap.definitionChanged")}
                      </span>
                    ) : null}
                  </span>
                ) : null}
                {call.resultPreview ? (
                  <span className="block truncate font-mono" title={call.resultPreview} data-recap-result>
                    {t("webmcp.calls.result", { preview: call.resultPreview })}
                  </span>
                ) : null}
                <WebMcpCallDiagnosis call={call} definitions={definitions} />
              </li>
            )
          })}
        </ol>
        {calls.length > RECAP_LIMIT ? (
          <p className="mt-1" data-recap-capped>
            {t("diffView.landing.browserRecap.capped", { shown: RECAP_LIMIT, total: calls.length })}
          </p>
        ) : null}
        <button type="button" className="mt-1 text-[var(--status-info)] hover:underline" onClick={() => void copyRecap()} data-recap-copy>
          {copied ? t("diffView.landing.browserRecap.copied") : t("diffView.landing.browserRecap.copy")}
        </button>
        {associationUnknown ? (
          <p className="mt-1" data-recap-unknown-association>
            {t("diffView.landing.browserRecap.unknownAssociation")}
          </p>
        ) : null}
        {notCalled.length > 0 ? (
          <p className="mt-1" data-recap-not-called>
            {t("diffView.landing.browserRecap.notCalled", { names: notCalled.map(redactWebMcpText).join(", ") })}
          </p>
        ) : null}
      </details>
    </div>
  )
}
