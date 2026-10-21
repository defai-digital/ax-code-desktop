import { webMcpDisplayText as redactWebMcpText } from "../../../../../shared/webmcp-redaction.mjs"
import { useI18n } from "@/lib/i18n"
import { agentDiagnosis, webMcpDefinitionChanged, type WebMcpDiagnosis, type WebMcpDiagnosisFinding } from "@/lib/webMcpDiagnosis"
import { webMcpDefinitionForDigest, type WebMcpToolDefinition } from "@/lib/webMcpCatalog"
import type { WebMcpCall } from "@/lib/webMcpCalls"
const shortDigest = (digest: string) => digest.slice(0, 8)
export function DiagnosisList({
  diagnosis,
  digest,
  currentDigest,
  source,
}: {
  diagnosis: WebMcpDiagnosis | { status: "unavailable"; reason: "no-arguments" | "unparsed" | "redacted" | "truncated" | "definition-unavailable" }
  digest: string | null
  currentDigest: string
  source: "manual" | "agent"
}) {
  const { t } = useI18n()
  const changed = webMcpDefinitionChanged(digest, currentDigest)
  const findingText = (finding: WebMcpDiagnosisFinding) =>
    t("webmcp.tools.diagnosis.finding", {
      property: redactWebMcpText(finding.property),
      rule: finding.expected ? `${finding.rule}:${finding.expected}` : finding.rule,
      kind: finding.valueKind,
    })
  return (
    <div className="space-y-1" data-webmcp-diagnosis={source}>
      <p className="typography-micro text-muted-foreground">{t("webmcp.tools.diagnosis.title")}</p>
      {diagnosis.status === "checked" && diagnosis.uncheckable?.length ? (
        <p className="typography-micro" data-webmcp-diagnosis-gap="redacted">
          {t("webmcp.tools.diagnosis.redacted")}
        </p>
      ) : null}
      {diagnosis.status === "unavailable" ? (
        <p className="typography-micro" data-webmcp-diagnosis-gap={diagnosis.reason}>
          {t(
            diagnosis.reason === "definition-unavailable" ? "webmcp.tools.diagnosis.definitionUnavailable" : diagnosis.reason === "truncated" ? "webmcp.tools.diagnosis.truncated" : diagnosis.reason === "no-arguments"
              ? "webmcp.tools.diagnosis.noArguments"
              : diagnosis.reason === "redacted"
                ? "webmcp.tools.diagnosis.redacted"
                : "webmcp.tools.diagnosis.unparsed",
          )}
        </p>
      ) : diagnosis.status === "unchecked" ? (
        <p className="typography-micro text-muted-foreground">
          {t(
            diagnosis.reason === "no-schema" ? "webmcp.tools.diagnosis.noSchema" : "webmcp.tools.diagnosis.unsupported",
          )}
        </p>
      ) : diagnosis.findings.length === 0 ? (
        diagnosis.uncheckable?.length ? null : (
          <p className="typography-micro text-muted-foreground">{t("webmcp.tools.diagnosis.none")}</p>
        )
      ) : (
        <ul className="space-y-0.5">
          {diagnosis.findings.map((finding) => (
            <li
              key={`${finding.property}:${finding.rule}:${finding.valueKind}`}
              data-webmcp-diagnosis-property={redactWebMcpText(finding.property)}
              data-webmcp-diagnosis-rule={finding.rule}
              data-webmcp-diagnosis-kind={finding.valueKind}
              className="typography-micro"
            >
              {findingText(finding)}
            </li>
          ))}
        </ul>
      )}
      <p className="typography-micro text-muted-foreground">
        {digest
          ? t("webmcp.tools.diagnosis.digest", { digest: shortDigest(digest) })
          : t("webmcp.tools.diagnosis.digestUnknown")}
      </p>
      {changed && digest ? (
        <p className="typography-micro" data-webmcp-definition-changed={source}>
          {t("webmcp.tools.diagnosis.changed", {
            digest: shortDigest(digest),
            current: shortDigest(currentDigest),
          })}
        </p>
      ) : null}
      <p className="typography-micro text-muted-foreground">{t("webmcp.tools.diagnosis.advisory")}</p>
    </div>
  )
}

export function WebMcpCallDiagnosis({ call, definitions }: { call: WebMcpCall; definitions: readonly WebMcpToolDefinition[] }) {
  const definition = webMcpDefinitionForDigest(definitions, call.definitionDigest)
  return <>
    {call.operation?.toLowerCase() === "invoke" ? <DiagnosisList diagnosis={agentDiagnosis(call, definition)}
      digest={call.definitionDigest} currentDigest={call.definitionDigest ?? ""} source="agent" /> : null}
    <WebMcpRuntimeRejections rejections={call.rejections} />
  </>
}
export function WebMcpRuntimeRejections({ rejections }: { rejections: WebMcpCall["rejections"] }) {
  const { t } = useI18n()
  if (!rejections?.length) return null
  return <ul data-webmcp-runtime-rejections className="typography-micro text-[var(--status-error)]">
    {rejections.map((entry, index) => <li key={index} data-webmcp-rejection-property={entry.property} data-webmcp-rejection-rule={entry.rule}>
      {t("webmcp.tools.diagnosis.runtimeRejection", { reason: [entry.property, entry.rule, entry.text].filter(Boolean).join(" · ") })}
    </li>)}
  </ul>
}
