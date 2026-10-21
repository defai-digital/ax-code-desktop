import React from "react"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/icon/Icon"
import { useI18n } from "@/lib/i18n"
import { toolForm, toolInput, toolInputWarnings, type ToolField } from "@/lib/webMcpToolForm"
import { desktopWebMcpResultOutcome, WEBMCP_FAILURE_REASONS, webMcpResultPreview } from "@/lib/toolHelpers"
import { useWebMcpBrowserStore, type WebMcpToolDefinition } from "@/stores/useWebMcpBrowserStore"

export type TryResult = { ok: boolean; outcome?: string; output?: unknown; reason?: string }

function FieldInput({
  field,
  value,
  onChange,
  id,
  describedBy,
}: {
  field: ToolField
  value: string
  onChange: (value: string) => void
  id: string
  describedBy?: string
}) {
  const className = "h-7 w-full rounded border border-border bg-background px-2 typography-meta"
  if (field.kind === "enum" || field.kind === "boolean") {
    const options = field.kind === "enum" ? (field.options ?? []) : ["true", "false"]
    return (
      <select
        id={id}
        aria-describedby={describedBy}
        className={className}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">—</option>
        {options
          .filter((option) => option !== "")
          .map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
      </select>
    )
  }
  return (
    <input
      id={id}
      aria-describedby={describedBy}
      className={className}
      inputMode={field.kind === "string" ? undefined : "decimal"}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

function ToolItem({ tool, tryTool }: { tool: WebMcpToolDefinition; tryTool: TryTool }) {
  const { t } = useI18n()
  const form = React.useMemo(() => toolForm(tool.inputSchema), [tool.inputSchema])
  const [open, setOpen] = React.useState(false)
  const [values, setValues] = React.useState<Record<string, string>>({})
  const [sendEmpty, setSendEmpty] = React.useState<Record<string, boolean>>({})
  const [jsonMode, setJsonMode] = React.useState(false)
  const [warnings, setWarnings] = React.useState<{ field: string; constraint: string }[]>([])
  const [inputIssue, setInputIssue] = React.useState<{ field: string; constraint: string } | null>(null)
  const [json, setJson] = React.useState("{}")
  const [running, setRunning] = React.useState(false)
  const [result, setResult] = React.useState<{ outcome: string; text: string } | null>(null)
  const baseId = React.useId()

  const constraintText = (field: ToolField, constraint: string) =>
    t(`webmcp.tools.constraint.${constraint}` as Parameters<typeof t>[0], {
      field: field.name,
      bound: webMcpResultPreview(field.constraints?.[constraint], constraint === "default" ? field.name : undefined),
    })
  const clearFeedback = () => {
    setWarnings([])
    setInputIssue(null)
    setResult(null)
  }

  const run = async () => {
    if (running) return
    let input: Record<string, unknown>
    if (form.kind === "fields" && !jsonMode) {
      const built = toolInput(form.fields, values, sendEmpty)
      if (!built.ok) {
        setInputIssue(built)
        setResult({
          outcome: "invalid-input",
          text: constraintText(form.fields.find((field) => field.name === built.field)!, built.constraint),
        })
        return
      }
      input = built.input
      const issues = toolInputWarnings(form.fields, input)
      if (issues.length && !warnings.length) {
        setWarnings(issues)
        setResult(null)
        return
      }
    } else {
      try {
        const parsed: unknown = JSON.parse(json)
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object")
        input = parsed as Record<string, unknown>
      } catch {
        setResult({ outcome: "invalid-input", text: t("webmcp.tools.invalidJson") })
        return
      }
    }
    if (new TextEncoder().encode(JSON.stringify(input)).byteLength > 65536) {
      setResult({ outcome: "failed", text: t("chat.toolPart.webmcp.reason.input-too-large") })
      return
    }
    setWarnings([])
    setInputIssue(null)
    setRunning(true)
    setResult(null)
    try {
      const reply = await tryTool(tool.name, input)
      const returnedOutcome = desktopWebMcpResultOutcome({ status: "completed", output: reply.output })
      const returnedFailure = returnedOutcome !== "completed" && returnedOutcome !== null
      const outcome = returnedFailure ? returnedOutcome : (reply.outcome ?? (reply.ok ? "completed" : "failed"))
      const reason = returnedFailure ? returnedOutcome : reply.reason
      const knownReason = (WEBMCP_FAILURE_REASONS as readonly string[]).includes(reason ?? "")
        ? reason
        : "native-failure"
      const label =
        outcome === "completed"
          ? t("webmcp.tools.completed")
          : outcome === "uncertain"
            ? `${t("webmcp.tools.uncertain")} ${t(`chat.toolPart.webmcp.reason.${knownReason}` as Parameters<typeof t>[0])}`
            : t(`chat.toolPart.webmcp.reason.${knownReason}` as Parameters<typeof t>[0])
      setResult({ outcome, text: [label, webMcpResultPreview(reply.output)].filter(Boolean).join("\n") })
    } catch {
      // IPC can disappear after the invocation was sent. Never infer failure or offer an automatic retry.
      setResult({
        outcome: "uncertain",
        text: `${t("webmcp.tools.uncertain")} ${t("chat.toolPart.webmcp.reason.provider-gone")}`,
      })
    } finally {
      setRunning(false)
    }
  }

  return (
    <li className="rounded border border-border/60" data-webmcp-tool={tool.name}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-start gap-2 px-2 py-1.5 text-left hover:bg-interactive-hover/40"
      >
        <Icon
          name={open ? "arrow-down-s" : "arrow-right-s"}
          className="mt-0.5 h-3.5 w-3.5 shrink-0"
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono typography-meta text-foreground">{tool.name}</span>
          {tool.description ? (
            <span className="block truncate typography-micro text-muted-foreground" title={tool.description}>
              {tool.description}
            </span>
          ) : null}
        </span>
      </button>
      {open ? (
        <div className="space-y-2 border-t border-border/60 px-2 py-2">
          {form.kind === "fields" && !jsonMode ? (
            form.fields.length === 0 ? (
              <p className="typography-micro text-muted-foreground">{t("webmcp.tools.noInput")}</p>
            ) : (
              form.fields.map((field, index) => (
                <div key={field.name} className="block space-y-0.5">
                  <label htmlFor={`${baseId}-field-${index}`}>
                    <span className="typography-micro text-muted-foreground">
                      <span className="font-mono">{field.name}</span>
                      {field.required ? " *" : ""} · {field.kind}
                      {field.description ? ` — ${field.description}` : ""}
                    </span>
                  </label>
                  {field.constraints ? (
                    <p
                      id={`${baseId}-hint-${index}`}
                      className="whitespace-pre-wrap typography-micro text-muted-foreground"
                      data-webmcp-constraints
                    >
                      {Object.keys(field.constraints).map((constraint) => (
                        <span key={constraint} className="block">
                          {constraintText(field, constraint)}
                        </span>
                      ))}
                    </p>
                  ) : null}
                  <FieldInput
                    id={`${baseId}-field-${index}`}
                    field={field}
                    describedBy={
                      [
                        field.constraints ? `${baseId}-hint-${index}` : "",
                        warnings.some((warning) => warning.field === field.name) || inputIssue?.field === field.name
                          ? `${baseId}-warning-${index}`
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ") || undefined
                    }
                    value={Object.hasOwn(values, field.name) ? values[field.name] : ""}
                    onChange={(value) => {
                      setValues((current) => ({ ...current, [field.name]: value }))
                      clearFeedback()
                    }}
                  />
                  {warnings.some((warning) => warning.field === field.name) || inputIssue?.field === field.name ? (
                    <div id={`${baseId}-warning-${index}`} role="alert" className="typography-micro">
                      {[
                        ...warnings.filter((warning) => warning.field === field.name),
                        ...(inputIssue?.field === field.name ? [inputIssue] : []),
                      ].map((issue) => (
                        <p key={issue.constraint}>{constraintText(field, issue.constraint)}</p>
                      ))}
                    </div>
                  ) : null}
                  {field.kind === "string" || field.kind === "enum" ? (
                    <label className="flex items-center gap-1 typography-micro">
                      <input
                        type="checkbox"
                        aria-describedby={
                          [
                            field.constraints ? `${baseId}-hint-${index}` : "",
                            warnings.some((warning) => warning.field === field.name) || inputIssue?.field === field.name
                              ? `${baseId}-warning-${index}`
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" ") || undefined
                        }
                        checked={sendEmpty[field.name] === true}
                        onChange={(event) => {
                          setSendEmpty((current) => ({ ...current, [field.name]: event.target.checked }))
                          clearFeedback()
                        }}
                      />
                      {t("webmcp.tools.sendEmpty", { field: field.name })}
                    </label>
                  ) : null}
                </div>
              ))
            )
          ) : (
            <div className="block space-y-0.5">
              <label htmlFor={`${baseId}-json`} className="typography-micro text-muted-foreground">
                {t("webmcp.tools.jsonInput")}
              </label>
              {form.kind === "json" ? (
                <p id={`${baseId}-json-fallback`} className="typography-micro text-muted-foreground">
                  {t(form.reason === "large" ? "webmcp.tools.jsonLarge" : "webmcp.tools.jsonComplex")}
                </p>
              ) : null}
              <p id={`${baseId}-json-limit`} className="typography-micro text-muted-foreground">
                {t("webmcp.tools.inputLimit")}
              </p>
              <textarea
                id={`${baseId}-json`}
                aria-describedby={`${baseId}-json-limit${form.kind === "json" ? ` ${baseId}-json-fallback` : ""}`}
                className="h-20 w-full rounded border border-border bg-background p-2 font-mono typography-micro"
                value={json}
                onChange={(event) => {
                  setJson(event.target.value)
                  clearFeedback()
                }}
                spellCheck={false}
              />
            </div>
          )}
          {form.kind === "fields" ? (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={() => {
                setJsonMode((current) => !current)
                clearFeedback()
              }}
            >
              {t(jsonMode ? "webmcp.tools.useFields" : "webmcp.tools.useJson")}
            </Button>
          ) : null}
          {warnings.length ? <p className="typography-micro">{t("webmcp.tools.advisory")}</p> : null}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="xs"
              variant="outline"
              aria-disabled={running}
              className="aria-disabled:opacity-50"
              onClick={() => void run()}
            >
              {running
                ? t("webmcp.tools.running")
                : t(warnings.length ? "webmcp.tools.sendAnyway" : "webmcp.tools.try")}
            </Button>
            <span className="typography-micro text-muted-foreground">{t("webmcp.tools.tryHint")}</span>
          </div>
          <div role="status" aria-live="polite">
            {result ? (
              <pre
                data-webmcp-tool-result={result.outcome}
                className={
                  result.outcome === "completed"
                    ? "max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-2 font-mono typography-micro"
                    : "max-h-40 overflow-auto whitespace-pre-wrap rounded p-2 typography-micro text-[var(--status-error)]"
                }
              >
                {result.text}
              </pre>
            ) : null}
            {result?.outcome === "uncertain" ? (
              <p className="typography-micro">{t("webmcp.tools.inspectPage")}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </li>
  )
}

type TryTool = (toolName: string, input: Record<string, unknown>) => Promise<TryResult>

/**
 * The tools the current page registers, visible before the agent is granted anything. "Try it" runs a tool on the page as
 * the user, the same as using the page; it creates no agent grant and adds nothing to the conversation.
 */
export function WebMcpToolPanel({ tryTool }: { tryTool: TryTool }) {
  const { t } = useI18n()
  const catalog = useWebMcpBrowserStore((state) => state.catalog)
  const origin = useWebMcpBrowserStore((state) => state.origin)
  const [open, setOpen] = React.useState(false)
  if (!origin || catalog.length === 0) return null
  return (
    <section aria-label={t("webmcp.tools.title")} className="border-b border-border/40" data-webmcp-tool-panel>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1 text-left typography-meta text-muted-foreground hover:text-foreground"
      >
        <Icon name={open ? "arrow-down-s" : "arrow-right-s"} className="h-3.5 w-3.5" aria-hidden="true" />
        {t("webmcp.tools.toggle", { count: catalog.length })}
      </button>
      {open ? (
        <ul className="max-h-72 space-y-1.5 overflow-auto px-2.5 pb-2">
          {catalog.map((tool) => (
            <ToolItem key={tool.name} tool={tool} tryTool={tryTool} />
          ))}
        </ul>
      ) : null}
    </section>
  )
}
