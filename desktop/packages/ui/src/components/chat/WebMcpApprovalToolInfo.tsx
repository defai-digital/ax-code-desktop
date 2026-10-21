import React from "react"

import { useI18n } from "@/lib/i18n"
import { truncateToCodeUnits } from "@/lib/textTruncate"
import type { WebMcpToolDefinition } from "@/lib/webMcpCatalog"
import { useWebMcpBrowserStore } from "@/stores/useWebMcpBrowserStore"

/** Input property names from a tool's schema, required ones first, capped for one line. */
function schemaInputs(schema: unknown): { name: string; required: boolean }[] {
  if (!schema || typeof schema !== "object") return []
  const record = schema as { properties?: unknown; required?: unknown }
  if (!record.properties || typeof record.properties !== "object") return []
  const required = new Set(Array.isArray(record.required) ? record.required.filter((key) => typeof key === "string") : [])
  return Object.keys(record.properties as Record<string, unknown>)
    .slice(0, 12)
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
}: {
  sessionID: string
  origin: string
  toolName: string
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
  if (!tool) return null
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
            names: inputs.map((input) => (input.required ? `${input.name}*` : input.name)).join(", "),
          })}
        </p>
      ) : null}
      {tool.description ? (
        <p style={{ unicodeBidi: "isolate" }} data-webmcp-approval-description>
          {t("chat.permissionCard.webmcp.pageSays", { description: truncateToCodeUnits(tool.description, 200) })}
        </p>
      ) : null}
      <p>{t("webmcp.tools.hintsDoNotApprove")}</p>
    </div>
  )
}
