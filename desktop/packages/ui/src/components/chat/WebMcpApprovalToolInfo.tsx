import { redactWebMcpText } from "../../../../../shared/webmcp-redaction.mjs"
import React from "react"

import { useI18n } from "@/lib/i18n"
import { truncateToCodeUnits } from "@/lib/textTruncate"
import type { WebMcpToolDefinition } from "@/lib/webMcpCatalog"
import { useWebMcpBrowserStore } from "@/stores/useWebMcpBrowserStore"

/** Input property names from a tool's schema, required ones first. */
function schemaInputs(schema: unknown): { name: string; required: boolean }[] {
  if (!schema || typeof schema !== "object") return []
  const record = schema as { properties?: unknown; required?: unknown }
  const required = new Set(
    Array.isArray(record.required) ? record.required.filter((key) => typeof key === "string") : [],
  )
  const properties = record.properties && typeof record.properties === "object" && !Array.isArray(record.properties)
    ? Object.keys(record.properties)
    : []
  return [...new Set([...required, ...properties])]
    .map((name) => ({ name, required: required.has(name) }))
    .sort((a, b) => Number(b.required) - Number(a.required))
}

/**
 * What the page told the project browser about the tool being approved: its hints, its inputs and its own description.
 * It is labelled as the page's claim. The effect sentence above it is built from call data only, and hints never approve.
 */
export function WebMcpApprovalToolInfo({
  sessionID,
  origin,
  toolName,
  definitionDigest,
}: {
  sessionID: string
  origin: string
  toolName: string
  definitionDigest: string | null
}) {
  const { t } = useI18n()
  const tool = useWebMcpBrowserStore(
    React.useCallback(
      (state) => {
        for (const view of Object.values(state.views)) {
          if (view.sessionID !== sessionID || view.origin !== origin) continue
          const match = view.catalog.find((candidate: WebMcpToolDefinition) => candidate.name === toolName)
          if (match) return match
        }
        return null
      },
      [origin, sessionID, toolName],
    ),
  )
  if (!tool || !definitionDigest || tool.definitionDigest !== definitionDigest)
    return (
      <p className="mb-2 typography-micro text-muted-foreground" data-webmcp-approval-definition-unknown>
        {t("chat.permissionCard.webmcp.definitionMayDiffer")}
      </p>
    )
  const hints = tool.annotations ?? {}
  const inputs = schemaInputs(tool.inputSchema)
  return (
    <div className="mb-2 space-y-1 typography-micro text-muted-foreground" data-webmcp-approval-tool>
      {hints.consequentialHint === true ? (
        <p className="text-[var(--status-warning)]" data-webmcp-approval-hint="consequential">
          {t("chat.permissionCard.webmcp.hintConsequential")}
        </p>
      ) : hints.readOnlyHint === true ? (
        <p data-webmcp-approval-hint="read-only">{t("chat.permissionCard.webmcp.hintReadOnly")}</p>
      ) : null}
      {hints.untrustedContentHint === true ? (
        <p data-webmcp-approval-hint="untrusted">{t("chat.permissionCard.webmcp.hintUntrusted")}</p>
      ) : null}
      {inputs.length > 0 ? (
        <p style={{ unicodeBidi: "isolate" }} data-webmcp-approval-inputs>
          {t("chat.permissionCard.webmcp.inputs", {
            names: inputs
              .slice(0, 12)
              .map((input) => (input.required ? `${redactWebMcpText(input.name)}*` : redactWebMcpText(input.name)))
              .join(", "),
          })}
        </p>
      ) : null}
      {inputs.length > 12 ? (
        <p data-webmcp-approval-inputs-truncated>
          {t("chat.permissionCard.webmcp.inputsTruncated", {
            shown: 12,
            total: inputs.length,
            required: inputs.slice(12).filter((input) => input.required).length,
          })}
        </p>
      ) : null}
      {tool.description ? (
        <p style={{ unicodeBidi: "isolate" }} data-webmcp-approval-description>
          {t("chat.permissionCard.webmcp.pageSays", {
            description: truncateToCodeUnits(redactWebMcpText(tool.description), 200),
          })}
        </p>
      ) : null}
      <p>{t("webmcp.tools.hintsDoNotApprove")}</p>
    </div>
  )
}
