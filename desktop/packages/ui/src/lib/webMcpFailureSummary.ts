import { webMcpDisplayText as redactWebMcpText } from "../../../../shared/webmcp-redaction.mjs"
import type { I18nKey } from "@/lib/i18n"
import { truncateToCodeUnits } from "./textTruncate"
import { agentDiagnosis } from "./webMcpDiagnosis"
import { webMcpDefinitionForDigest, type WebMcpToolDefinition } from "./webMcpCatalog"
import type { WebMcpCall } from "./webMcpCalls"

/** A bounded, credential-filtered explanation shared by collapsed transcript rows and the call strip. */
export function webMcpFailureSummary(call: WebMcpCall | undefined, definitions: readonly WebMcpToolDefinition[], t: (key: I18nKey) => string) {
  if (!call || call.outcome !== "failed") return null
  const diagnosis = agentDiagnosis(call, webMcpDefinitionForDigest(definitions, call.definitionDigest))
  const finding = diagnosis.status === "checked" ? diagnosis.findings[0] : undefined
  const runtimeFinding = call.rejections?.find((entry) => entry.property && entry.rule)
  const reason = call.rejections?.find((entry) => entry.text)?.text
  const property = finding?.property ?? runtimeFinding?.property
  const rule = finding ? [finding.rule, finding.expected].filter(Boolean).join(":") : runtimeFinding?.rule
  return [
    call.failureReason ? t(`chat.toolPart.webmcp.reason.${call.failureReason}` as I18nKey) : null,
    reason ? truncateToCodeUnits(redactWebMcpText(reason).replace(/\s+/g, " "), 160) : null,
    property && rule ? `${truncateToCodeUnits(redactWebMcpText(property), 80)} · ${rule}` : null,
  ].filter(Boolean).join(" · ") || null
}
