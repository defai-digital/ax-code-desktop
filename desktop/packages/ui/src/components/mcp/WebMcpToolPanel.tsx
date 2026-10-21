import React from "react"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/icon/Icon"
import { useI18n } from "@/lib/i18n"
import type { I18nKey, I18nParams } from "@/lib/i18n/store"
import { lintWebMcpTool, type WebMcpLintFinding } from "@/lib/webMcpToolLint"
import { toolForm, toolInput, toolInputWarnings, type ToolField } from "@/lib/webMcpToolForm"
import { desktopWebMcpResultOutcome, WEBMCP_FAILURE_REASONS, webMcpResultPreview } from "@/lib/toolHelpers"
import {
  useWebMcpBrowserStore,
  type WebMcpCatalogRejectionReason,
  type WebMcpRegistrationEvent,
  type WebMcpToolDefinition,
} from "@/stores/useWebMcpBrowserStore"

export type TryResult = { ok: boolean; outcome?: string; output?: unknown; reason?: string }

const BADGE_CLASS = "rounded border border-border/60 px-1 typography-micro text-muted-foreground"
const SCHEMA_TEXT_CAP = 32768

const REJECTION_TEXT: Record<WebMcpCatalogRejectionReason, I18nKey> = {
  "duplicate-name": "webmcp.tools.rejection.duplicate-name",
  "invalid-schema": "webmcp.tools.rejection.invalid-schema",
  "invalid-name": "webmcp.tools.rejection.invalid-name",
  "invalid-description": "webmcp.tools.rejection.invalid-description",
  "definition-too-large": "webmcp.tools.rejection.definition-too-large",
  "catalog-too-large": "webmcp.tools.rejection.catalog-too-large",
}

const REGISTRATION_TEXT: Record<WebMcpRegistrationEvent["kind"], I18nKey> = {
  added: "webmcp.tools.registration.added",
  removed: "webmcp.tools.registration.removed",
  changed: "webmcp.tools.registration.changed",
}

type Translate = (key: I18nKey, params?: I18nParams) => string

function storedDraft(name: string, digest: string) {
  const draft = useWebMcpBrowserStore.getState().toolDrafts[name]
  if (!draft || draft.digest !== digest) {
    return {
      values: {} as Record<string, string>,
      sendEmpty: {} as Record<string, boolean>,
      json: "{}",
      jsonMode: false,
    }
  }
  return draft
}

function storedRun(name: string, digest: string): { outcome: string; text: string; stale: boolean } | null {
  const run = useWebMcpBrowserStore.getState().toolRuns[name]
  if (!run) return null
  return { outcome: run.outcome, text: run.text, stale: run.stale || run.digest !== digest }
}

function schemaDocument(schema: unknown): { text: string; truncated: boolean } | null {
  if (schema === undefined) return null
  try {
    const text = JSON.stringify(schema, null, 2)
    if (typeof text !== "string") return null
    if (text.length <= SCHEMA_TEXT_CAP) return { text, truncated: false }
    return { text: text.slice(0, SCHEMA_TEXT_CAP), truncated: true }
  } catch {
    return null
  }
}

function lintText(t: Translate, finding: WebMcpLintFinding) {
  if (finding.code === "name-length") return t("webmcp.tools.lint.nameLength", { length: finding.length ?? 0 })
  if (finding.code === "description-length") {
    return t("webmcp.tools.lint.descriptionLength", { length: finding.length ?? 0 })
  }
  if (finding.code === "missing-description") return t("webmcp.tools.lint.missingDescription")
  if (finding.code === "missing-property-description") {
    return t("webmcp.tools.lint.missingPropertyDescription", { names: finding.names ?? "" })
  }
  if (finding.code === "opaque-value") return t("webmcp.tools.lint.opaque", { names: finding.names ?? "" })
  return t("webmcp.tools.lint.rejectedKeyword", { keyword: finding.keyword ?? "" })
}

function shortDigest(value: string) {
  return value.slice(0, 12)
}

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

function ToolBadges({ tool }: { tool: WebMcpToolDefinition }) {
  const { t } = useI18n()
  const kind = tool.kind === "form" ? "form" : "script"
  return (
    <span className="mt-0.5 flex shrink-0 flex-wrap justify-end gap-1">
      <span data-webmcp-tool-kind={kind} className={BADGE_CLASS}>
        {t(kind === "form" ? "webmcp.tools.kind.form" : "webmcp.tools.kind.script")}
      </span>
      {tool.annotations?.readOnlyHint ? (
        <span data-webmcp-hint="readOnlyHint" className={BADGE_CLASS}>
          {t("webmcp.tools.hint.readOnly")}
        </span>
      ) : null}
      {tool.annotations?.untrustedContentHint ? (
        <span data-webmcp-hint="untrustedContentHint" className={BADGE_CLASS}>
          {t("webmcp.tools.hint.untrusted")}
        </span>
      ) : null}
      {tool.annotations?.consequentialHint ? (
        <span data-webmcp-hint="consequentialHint" className={BADGE_CLASS}>
          {t("webmcp.tools.hint.consequential")}
        </span>
      ) : null}
    </span>
  )
}

function LintNotes({ tool }: { tool: WebMcpToolDefinition }) {
  const { t } = useI18n()
  const findings = React.useMemo(
    () => lintWebMcpTool({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema }),
    [tool.description, tool.inputSchema, tool.name],
  )
  if (findings.length === 0) return null
  return (
    <div className="space-y-1">
      <p className="typography-micro text-muted-foreground">{t("webmcp.tools.lint.title")}</p>
      <ul className="space-y-0.5">
        {findings.map((finding) => (
          <li
            key={`${finding.code}:${finding.keyword ?? ""}:${finding.names ?? ""}`}
            data-webmcp-lint={finding.code}
            {...(finding.keyword ? { "data-webmcp-lint-keyword": finding.keyword } : {})}
            className="typography-micro text-muted-foreground"
          >
            {lintText(t, finding)}
          </li>
        ))}
      </ul>
      <p className="typography-micro text-muted-foreground">{t("webmcp.tools.lint.advice")}</p>
    </div>
  )
}

function SchemaBlock({ schema }: { schema: unknown }) {
  const { t } = useI18n()
  const [open, setOpen] = React.useState(false)
  const rendered = React.useMemo(() => schemaDocument(schema), [schema])
  return (
    <div className="space-y-1">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="typography-micro text-muted-foreground"
      >
        {t("webmcp.tools.schema")}
      </button>
      {open ? (
        rendered ? (
          <>
            <pre
              data-webmcp-schema=""
              data-webmcp-schema-truncated={rendered.truncated ? "true" : undefined}
              aria-readonly="true"
              className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-2 font-mono typography-micro"
            >
              {rendered.text}
            </pre>
            {rendered.truncated ? (
              <p className="typography-micro text-muted-foreground">{t("webmcp.tools.schemaTruncated")}</p>
            ) : null}
          </>
        ) : (
          <p className="typography-micro text-muted-foreground">{t("webmcp.tools.schemaUnavailable")}</p>
        )
      ) : null}
    </div>
  )
}

function ToolItem({ tool, tryTool }: { tool: WebMcpToolDefinition; tryTool: TryTool }) {
  const { t } = useI18n()
  const saveToolDraft = useWebMcpBrowserStore((state) => state.saveToolDraft)
  const recordToolRun = useWebMcpBrowserStore((state) => state.recordToolRun)
  const clearToolRun = useWebMcpBrowserStore((state) => state.clearToolRun)
  const digest = tool.digest ?? ""
  const form = React.useMemo(() => toolForm(tool.inputSchema), [tool.inputSchema])
  const [open, setOpen] = React.useState(false)
  const [values, setValues] = React.useState<Record<string, string>>(() => storedDraft(tool.name, digest).values)
  const [sendEmpty, setSendEmpty] = React.useState<Record<string, boolean>>(
    () => storedDraft(tool.name, digest).sendEmpty,
  )
  const [jsonMode, setJsonMode] = React.useState(() => storedDraft(tool.name, digest).jsonMode)
  const [warnings, setWarnings] = React.useState<{ field: string; constraint: string }[]>([])
  const [inputIssue, setInputIssue] = React.useState<{ field: string; constraint: string } | null>(null)
  const [json, setJson] = React.useState(() => storedDraft(tool.name, digest).json)
  const [running, setRunning] = React.useState(false)
  const [result, setResult] = React.useState<{ outcome: string; text: string; stale: boolean } | null>(() =>
    storedRun(tool.name, digest),
  )
  const baseId = React.useId()

  React.useEffect(() => {
    saveToolDraft(tool.name, { digest, values, sendEmpty, json, jsonMode })
  }, [digest, json, jsonMode, saveToolDraft, sendEmpty, tool.name, values])

  const constraintText = (field: ToolField, constraint: string) =>
    t(`webmcp.tools.constraint.${constraint}` as I18nKey, {
      field: field.name,
      bound: webMcpResultPreview(field.constraints?.[constraint], constraint === "default" ? field.name : undefined),
    })
  const showResult = (next: { outcome: string; text: string } | null) => {
    setResult(next ? { outcome: next.outcome, text: next.text, stale: false } : null)
    if (next) recordToolRun(tool.name, { digest, outcome: next.outcome, text: next.text, stale: false })
    else clearToolRun(tool.name)
  }
  const clearFeedback = () => {
    setWarnings([])
    setInputIssue(null)
    showResult(null)
  }

  const run = async () => {
    if (running) return
    let input: Record<string, unknown>
    if (form.kind === "fields" && !jsonMode) {
      const built = toolInput(form.fields, values, sendEmpty)
      if (!built.ok) {
        setInputIssue(built)
        showResult({
          outcome: "invalid-input",
          text: constraintText(form.fields.find((field) => field.name === built.field)!, built.constraint),
        })
        return
      }
      input = built.input
      const issues = toolInputWarnings(form.fields, input)
      if (issues.length && !warnings.length) {
        setWarnings(issues)
        showResult(null)
        return
      }
    } else {
      try {
        const parsed: unknown = JSON.parse(json)
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object")
        input = parsed as Record<string, unknown>
      } catch {
        showResult({ outcome: "invalid-input", text: t("webmcp.tools.invalidJson") })
        return
      }
    }
    if (new TextEncoder().encode(JSON.stringify(input)).byteLength > 65536) {
      showResult({ outcome: "failed", text: t("chat.toolPart.webmcp.reason.input-too-large") })
      return
    }
    setWarnings([])
    setInputIssue(null)
    setRunning(true)
    showResult(null)
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
            ? `${t("webmcp.tools.uncertain")} ${t(`chat.toolPart.webmcp.reason.${knownReason}` as I18nKey)}`
            : t(`chat.toolPart.webmcp.reason.${knownReason}` as I18nKey)
      showResult({ outcome, text: [label, webMcpResultPreview(reply.output)].filter(Boolean).join("\n") })
    } catch {
      // IPC can disappear after the invocation was sent. Never infer failure or offer an automatic retry.
      showResult({
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
        <ToolBadges tool={tool} />
      </button>
      {open ? (
        <div className="space-y-2 border-t border-border/60 px-2 py-2">
          {tool.description ? (
            <p
              data-webmcp-description=""
              className="whitespace-pre-wrap break-words typography-micro text-muted-foreground"
            >
              {tool.description}
            </p>
          ) : null}
          <LintNotes tool={tool} />
          <SchemaBlock schema={tool.inputSchema} />
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
              <>
                {result.stale ? <p>{t("webmcp.tools.resultStale")}</p> : null}
                <pre
                  data-webmcp-tool-result={result.outcome}
                  data-webmcp-stale={result.stale ? "true" : undefined}
                  className={
                    result.outcome === "completed"
                      ? "max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-2 font-mono typography-micro"
                      : "max-h-40 overflow-auto whitespace-pre-wrap rounded p-2 typography-micro text-[var(--status-error)]"
                  }
                >
                  {result.text}
                </pre>
              </>
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
 * Hint badges and authoring notes never approve a call. A rejected registration is named here and does not hide the page.
 */
export function WebMcpToolPanel({ tryTool }: { tryTool: TryTool }) {
  const { t } = useI18n()
  const catalog = useWebMcpBrowserStore((state) => state.catalog)
  const origin = useWebMcpBrowserStore((state) => state.origin)
  const catalogLimit = useWebMcpBrowserStore((state) => state.catalogLimit)
  const catalogRejection = useWebMcpBrowserStore((state) => state.catalogRejection)
  const registration = useWebMcpBrowserStore((state) => state.registration)
  const [open, setOpen] = React.useState(false)
  if (!origin || (catalog.length === 0 && !catalogRejection && registration.length === 0)) return null
  const truncated = catalogLimit.truncation !== null || catalogLimit.shown < catalogLimit.total
  const timeline = [...registration].reverse()
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
      {truncated ? (
        <p
          data-webmcp-catalog-truncation={catalogLimit.truncation ?? "count"}
          className="px-2.5 pb-1 typography-micro text-muted-foreground"
        >
          {t("webmcp.tools.truncated", { shown: catalogLimit.shown, total: catalogLimit.total })}
        </p>
      ) : null}
      {catalogRejection ? (
        <p
          role="alert"
          data-webmcp-catalog-rejection={catalogRejection.reason}
          data-webmcp-catalog-rejection-tool={catalogRejection.tool}
          className="px-2.5 pb-1 typography-micro text-[var(--status-error)]"
        >
          {t("webmcp.tools.rejection.title")}{" "}
          {t(REJECTION_TEXT[catalogRejection.reason], {
            tool: catalogRejection.tool || t("webmcp.tools.rejection.unnamed"),
          })}
        </p>
      ) : null}
      {open ? (
        <div className="space-y-2 px-2.5 pb-2">
          <p className="typography-micro text-muted-foreground">{t("webmcp.tools.origin", { origin })}</p>
          <p className="typography-micro text-muted-foreground">{t("webmcp.tools.hintsDoNotApprove")}</p>
          {timeline.length ? (
            <div className="space-y-1">
              <p className="typography-micro text-muted-foreground">{t("webmcp.tools.registration.title")}</p>
              <ol className="space-y-0.5" data-webmcp-registration="">
                {timeline.map((event, index) => (
                  <li
                    key={`${index}:${event.kind}:${event.name}:${event.digest}`}
                    data-webmcp-registration-kind={event.kind}
                    className="font-mono typography-micro text-muted-foreground"
                  >
                    {t(REGISTRATION_TEXT[event.kind], {
                      name: event.name,
                      digest: shortDigest(event.digest),
                      previous: shortDigest(event.previousDigest ?? ""),
                    })}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          <ul className="max-h-72 space-y-1.5 overflow-auto">
            {catalog.map((tool) => (
              <ToolItem key={`${tool.name}:${tool.digest ?? ""}`} tool={tool} tryTool={tryTool} />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
