import React from "react"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/icon/Icon"
import { useI18n } from "@/lib/i18n"
import { toolForm, toolInput, type ToolField } from "@/lib/webMcpToolForm"
import { useWebMcpBrowserStore, type WebMcpToolDefinition } from "@/stores/useWebMcpBrowserStore"

type TryResult = { ok: boolean; output?: unknown; reason?: string }

const RESULT_PREVIEW_LIMIT = 4000

function resultText(output: unknown): string {
  let text: string
  try {
    text = typeof output === "string" ? output : JSON.stringify(output, null, 2) ?? ""
  } catch {
    text = String(output)
  }
  return text.length > RESULT_PREVIEW_LIMIT ? `${text.slice(0, RESULT_PREVIEW_LIMIT)}…` : text
}

function FieldInput({
  field,
  value,
  onChange,
  id,
}: {
  field: ToolField
  value: string
  onChange: (value: string) => void
  id: string
}) {
  const className = "h-7 w-full rounded border border-border bg-background px-2 typography-meta"
  if (field.kind === "enum" || field.kind === "boolean") {
    const options = field.kind === "enum" ? field.options : ["true", "false"]
    return (
      <select id={id} className={className} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">—</option>
        {options.map((option) => (
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
  const [json, setJson] = React.useState("{}")
  const [running, setRunning] = React.useState(false)
  const [result, setResult] = React.useState<{ ok: boolean; text: string } | null>(null)
  const baseId = React.useId()

  const run = async () => {
    if (running) return
    let input: Record<string, unknown>
    if (form.kind === "fields") {
      const built = toolInput(form.fields, values)
      if (!built.ok) {
        setResult({ ok: false, text: t("webmcp.tools.invalidField", { field: built.field }) })
        return
      }
      input = built.input
    } else {
      try {
        const parsed: unknown = JSON.parse(json)
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object")
        input = parsed as Record<string, unknown>
      } catch {
        setResult({ ok: false, text: t("webmcp.tools.invalidJson") })
        return
      }
    }
    setRunning(true)
    setResult(null)
    try {
      const reply = await tryTool(tool.name, input)
      setResult(
        reply.ok
          ? { ok: true, text: resultText(reply.output) }
          : {
              ok: false,
              text: t(reply.reason === "tool-unavailable" ? "webmcp.tools.unavailable" : "webmcp.tools.failed"),
            },
      )
    } catch {
      setResult({ ok: false, text: t("webmcp.tools.failed") })
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
        <Icon name={open ? "arrow-down-s" : "arrow-right-s"} className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
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
          {form.kind === "fields" ? (
            form.fields.length === 0 ? (
              <p className="typography-micro text-muted-foreground">{t("webmcp.tools.noInput")}</p>
            ) : (
              form.fields.map((field) => (
                <label key={field.name} htmlFor={`${baseId}-${field.name}`} className="block space-y-0.5">
                  <span className="typography-micro text-muted-foreground">
                    <span className="font-mono">{field.name}</span>
                    {field.required ? " *" : ""} · {field.kind}
                    {field.description ? ` — ${field.description}` : ""}
                  </span>
                  <FieldInput
                    id={`${baseId}-${field.name}`}
                    field={field}
                    value={values[field.name] ?? ""}
                    onChange={(value) => setValues((current) => ({ ...current, [field.name]: value }))}
                  />
                </label>
              ))
            )
          ) : (
            <label className="block space-y-0.5">
              <span className="typography-micro text-muted-foreground">{t("webmcp.tools.jsonInput")}</span>
              <textarea
                className="h-20 w-full rounded border border-border bg-background p-2 font-mono typography-micro"
                value={json}
                onChange={(event) => setJson(event.target.value)}
                spellCheck={false}
              />
            </label>
          )}
          <div className="flex items-center gap-2">
            <Button type="button" size="xs" variant="outline" disabled={running} onClick={() => void run()}>
              {running ? t("webmcp.tools.running") : t("webmcp.tools.try")}
            </Button>
            <span className="typography-micro text-muted-foreground">{t("webmcp.tools.tryHint")}</span>
          </div>
          <div role="status" aria-live="polite">
            {result ? (
              <pre
                data-webmcp-tool-result={result.ok ? "ok" : "error"}
                className={
                  result.ok
                    ? "max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-2 font-mono typography-micro"
                    : "rounded p-2 typography-micro text-[var(--status-error)]"
                }
              >
                {result.text}
              </pre>
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
