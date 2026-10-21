import { redactWebMcpReport, redactWebMcpText } from "../../../../../shared/webmcp-redaction.mjs"
import { useCurrentWebMcpViewKey, useWebMcpBrowserValue } from "@/hooks/useWebMcpBrowser"
import React from "react"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/icon/Icon"
import { copyTextToClipboard } from "@/lib/clipboard"
import { useI18n } from "@/lib/i18n"
import type { I18nKey, I18nParams } from "@/lib/i18n/store"
import type { WebMcpCall } from "@/lib/webMcpCalls"
import {
  diagnoseWebMcpInput,
  webMcpDefinitionChanged,
  webMcpDefinitionsDiffer,
  webMcpRegressionExport,
  type WebMcpDiagnosis,
  type WebMcpDiagnosisFinding,
} from "@/lib/webMcpDiagnosis"
import { lintWebMcpTool, type WebMcpLintFinding } from "@/lib/webMcpToolLint"
import { draftFromRecordedInput, toolForm, toolInput, toolInputWarnings, type ToolField } from "@/lib/webMcpToolForm"
import {
  desktopWebMcpResultOutcome,
  WEBMCP_FAILURE_REASONS,
  webMcpResultPreview,
  isWebMcpSensitiveName,
  redactWebMcpInput,
} from "@/lib/toolHelpers"
import {
  useWebMcpBrowserStore,
  type WebMcpCatalogRejectionReason,
  type WebMcpJournalEntry,
  type WebMcpRegistrationEvent,
  type WebMcpToolDefinition,
} from "@/stores/useWebMcpBrowserStore"
import { createWebMcpJournalId } from "@/lib/webMcpCatalog"

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

function storedView(key?: string) {
  const state = useWebMcpBrowserStore.getState()
  return key ? state.views[key] : state
}

function storedDraft(name: string, digest: string, key?: string) {
  const draft = storedView(key)?.toolDrafts[name]
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

function storedRun(
  name: string,
  digest: string,
  key?: string,
): { outcome: string; text: string; stale: boolean } | null {
  const run = storedView(key)?.toolRuns[name]
  if (!run) return null
  return { outcome: run.outcome, text: run.text, stale: run.stale || run.digest !== digest }
}

function schemaDocument(schema: unknown): { text: string; truncated: boolean } | null {
  if (schema === undefined) return null
  try {
    const text = JSON.stringify(redactWebMcpReport(schema), null, 2)
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
    return t("webmcp.tools.lint.missingPropertyDescription", { names: redactWebMcpText(finding.names ?? "") })
  }
  if (finding.code === "opaque-value")
    return t("webmcp.tools.lint.opaque", { names: redactWebMcpText(finding.names ?? "") })
  return t("webmcp.tools.lint.rejectedKeyword", { keyword: redactWebMcpText(finding.keyword ?? "") })
}

function shortDigest(value: string) {
  return value.slice(0, 12)
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0 ms"
  if (ms < 1000) return `${Math.round(ms)} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`
  return `${Math.round(ms / 60_000)} min`
}

function inputText(input: Record<string, unknown>): string {
  try {
    // Shown on screen next to the agent's call: secrets are redacted the same way the transcript redacts them.
    return JSON.stringify(redactWebMcpInput(input), null, 2)
  } catch {
    return "{}"
  }
}

function CopyExport({
  tool,
  input,
  outcome,
  copyId,
}: {
  tool: string
  input: Record<string, unknown> | null
  outcome: string
  copyId: string
}) {
  const { t } = useI18n()
  const [copied, setCopied] = React.useState<"test" | "run" | null>(null)
  const exported = input ? webMcpRegressionExport({ tool, input, outcome }) : null
  const copy = async (kind: "test" | "run", text: string) => {
    const result = await copyTextToClipboard(text)
    if (!result.ok) return
    setCopied(kind)
    window.setTimeout(() => setCopied((current) => (current === kind ? null : current)), 1500)
  }
  if (!exported) {
    if (input) return null
    return <p className="typography-micro text-muted-foreground">{t("webmcp.tools.export.unavailable")}</p>
  }
  return (
    <div className="space-y-1" data-webmcp-export={copyId}>
      <pre
        data-webmcp-export-snippet=""
        className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-2 font-mono typography-micro"
      >
        {exported.snippet}
      </pre>
      <code data-webmcp-export-run="" className="block break-all font-mono typography-micro">
        {exported.runArgument}
      </code>
      <div className="flex flex-wrap gap-1">
        <Button type="button" size="xs" variant="ghost" onClick={() => void copy("test", exported.snippet)}>
          {copied === "test" ? t("webmcp.tools.export.copied") : t("webmcp.tools.export.copyTest")}
        </Button>
        <Button type="button" size="xs" variant="ghost" onClick={() => void copy("run", exported.runArgument)}>
          {copied === "run" ? t("webmcp.tools.export.copied") : t("webmcp.tools.export.copyRun")}
        </Button>
      </div>
    </div>
  )
}

function DiagnosisList({
  diagnosis,
  digest,
  currentDigest,
  source,
}: {
  diagnosis: WebMcpDiagnosis | { status: "unavailable"; reason: "no-arguments" | "unparsed" | "redacted" }
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
            diagnosis.reason === "no-arguments"
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

function agentDiagnosis(
  call: WebMcpCall,
  schema: unknown,
): WebMcpDiagnosis | { status: "unavailable"; reason: "no-arguments" | "unparsed" | "redacted" } {
  if (call.inputKind === "redacted") return { status: "unavailable", reason: "redacted" }
  if (call.inputKind === "unparsed") return { status: "unavailable", reason: "unparsed" }
  if (call.inputKind === "missing" || !call.input) return { status: "unavailable", reason: "no-arguments" }
  return diagnoseWebMcpInput(schema, call.input)
}

/** The page outcome a regression snippet should assert for one transcript call. */
function recordedPageOutcome(call: WebMcpCall): string {
  if (call.outcome === "ok") return "completed"
  if (
    call.failureReason === "timeout" ||
    call.failureReason === "cancelled" ||
    call.failureReason === "application-error"
  ) {
    return call.failureReason
  }
  return call.outcome === "failed" ? "failed" : "running"
}

function ToolCompare({
  tool,
  journalEntry,
  agentCall,
}: {
  tool: WebMcpToolDefinition
  journalEntry: WebMcpJournalEntry | null
  agentCall: WebMcpCall | null
}) {
  const { t } = useI18n()
  const digest = tool.definitionDigest ?? ""
  const differ = webMcpDefinitionsDiffer(journalEntry?.definitionDigest, agentCall?.definitionDigest)
  if (!journalEntry && !agentCall) return null
  return (
    <div className="space-y-2" data-webmcp-compare="">
      <p className="typography-micro text-muted-foreground">{t("webmcp.tools.compare.title")}</p>
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(12rem, 1fr))" }}>
        <div data-webmcp-compare-manual="" className="min-w-0 space-y-1">
          <p className="typography-micro">{t("webmcp.tools.compare.manual")}</p>
          {journalEntry ? (
            <>
              <p className="typography-micro text-muted-foreground">{t("webmcp.tools.compare.input")}</p>
              <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-2 font-mono typography-micro">
                {inputText(journalEntry.input)}
              </pre>
              <pre
                data-webmcp-compare-result={journalEntry.outcome}
                className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-2 font-mono typography-micro"
              >
                {redactWebMcpText(journalEntry.text)}
              </pre>
              <DiagnosisList
                diagnosis={diagnoseWebMcpInput(tool.inputSchema, journalEntry.input)}
                digest={journalEntry.definitionDigest ?? null}
                currentDigest={digest}
                source="manual"
              />
              <CopyExport
                tool={journalEntry.tool}
                input={journalEntry.input}
                outcome={journalEntry.outcome}
                copyId="manual"
              />
            </>
          ) : (
            <p className="typography-micro text-muted-foreground">{t("webmcp.tools.compare.noManual")}</p>
          )}
        </div>
        <div data-webmcp-compare-agent="" className="min-w-0 space-y-1">
          <p className="typography-micro">{t("webmcp.tools.compare.agent")}</p>
          {agentCall ? (
            <>
              <p className="typography-micro text-muted-foreground">{t("webmcp.tools.compare.input")}</p>
              <pre
                data-webmcp-compare-agent-arguments=""
                className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-2 font-mono typography-micro"
              >
                {agentCall.argumentsText ?? (agentCall.argumentsMissing ? t("webmcp.tools.diagnosis.noArguments") : "")}
              </pre>
              <DiagnosisList
                diagnosis={agentDiagnosis(agentCall, tool.inputSchema)}
                digest={agentCall.definitionDigest}
                currentDigest={digest}
                source="agent"
              />
              <CopyExport
                tool={agentCall.toolName ?? tool.name}
                input={agentCall.input}
                outcome={recordedPageOutcome(agentCall)}
                copyId="agent"
              />
            </>
          ) : (
            <p className="typography-micro text-muted-foreground">{t("webmcp.tools.compare.noAgent")}</p>
          )}
        </div>
      </div>
      {differ && journalEntry?.definitionDigest && agentCall?.definitionDigest ? (
        <p className="typography-micro" data-webmcp-definition-diff="">
          {t("webmcp.tools.compare.differentDefinitions", {
            manual: shortDigest(journalEntry.definitionDigest),
            agent: shortDigest(agentCall.definitionDigest),
          })}
        </p>
      ) : null}
    </div>
  )
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
    const options = (field.kind === "enum" ? (field.options ?? []) : ["true", "false"]).filter(
      (option) => option !== "",
    )
    const maskOptions =
      isWebMcpSensitiveName(field.name) || options.some((option) => redactWebMcpText(option) !== option)
    const optionValue = (option: string, index: number) => (maskOptions ? `redacted-option-${index}` : option)
    return (
      <select
        id={id}
        aria-describedby={describedBy}
        className={className}
        value={value === "" ? "" : optionValue(value, options.indexOf(value))}
        onChange={(event) =>
          onChange(
            options.find((option, index) => optionValue(option, index) === event.target.value) ?? event.target.value,
          )
        }
      >
        <option value="">—</option>
        {options.map((option, index) => (
          <option key={index} value={optionValue(option, index)}>
            {isWebMcpSensitiveName(field.name) ? webMcpResultPreview(option, field.name) : redactWebMcpText(option)}
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
      // A secret-named field is masked while typed, like any password field.
      type={isWebMcpSensitiveName(field.name) ? "password" : undefined}
      autoComplete={isWebMcpSensitiveName(field.name) ? "off" : undefined}
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
            {...(finding.keyword ? { "data-webmcp-lint-keyword": redactWebMcpText(finding.keyword) } : {})}
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

function ToolItem({
  tool,
  binding,
  tryTool,
  viewKey,
  journalEntry,
  replay,
  agentCall,
}: {
  tool: WebMcpToolDefinition
  binding: TryToolBinding
  tryTool: TryTool
  viewKey?: string
  journalEntry: WebMcpJournalEntry | null
  replay: { id: string; input: Record<string, unknown>; nonce: number } | null
  agentCall: WebMcpCall | null
}) {
  const { t } = useI18n()
  const saveToolDraft = useWebMcpBrowserStore((state) => state.saveToolDraft)
  const recordToolRun = useWebMcpBrowserStore((state) => state.recordToolRun)
  const recordToolJournal = useWebMcpBrowserStore((state) => state.recordToolJournal)
  const clearToolRun = useWebMcpBrowserStore((state) => state.clearToolRun)
  const digest = tool.digest ?? ""
  const form = React.useMemo(() => toolForm(tool.inputSchema), [tool.inputSchema])
  const [open, setOpen] = React.useState(false)
  const [values, setValues] = React.useState<Record<string, string>>(
    () => storedDraft(tool.name, digest, viewKey).values,
  )
  const [sendEmpty, setSendEmpty] = React.useState<Record<string, boolean>>(
    () => storedDraft(tool.name, digest, viewKey).sendEmpty,
  )
  const [jsonMode, setJsonMode] = React.useState(() => storedDraft(tool.name, digest, viewKey).jsonMode)
  const [warnings, setWarnings] = React.useState<{ field: string; constraint: string }[]>([])
  const [inputIssue, setInputIssue] = React.useState<{ field: string; constraint: string } | null>(null)
  const [json, setJson] = React.useState(() => storedDraft(tool.name, digest, viewKey).json)
  const [running, setRunning] = React.useState(false)
  const [result, setResult] = React.useState<{ outcome: string; text: string; stale: boolean } | null>(() =>
    storedRun(tool.name, digest, viewKey),
  )
  const baseId = React.useId()
  const appliedReplay = React.useRef<number | null>(null)

  React.useEffect(() => {
    saveToolDraft(tool.name, { digest, values, sendEmpty, json, jsonMode }, viewKey)
  }, [digest, json, jsonMode, saveToolDraft, sendEmpty, tool.name, values, viewKey])

  React.useEffect(() => {
    if (!replay) {
      if (appliedReplay.current !== null) {
        appliedReplay.current = null
        const draft = storedDraft(tool.name, digest, viewKey)
        setValues(draft.values)
        setSendEmpty(draft.sendEmpty)
        setJson(draft.json)
        setJsonMode(draft.jsonMode)
        setWarnings([])
        setInputIssue(null)
      }
      return
    }
    // A second click of the same row gets a new nonce and reloads the recorded input. Schema identity changes do not.
    if (appliedReplay.current === replay.nonce) return
    appliedReplay.current = replay.nonce
    const loaded = draftFromRecordedInput(tool.inputSchema, replay.input)
    setOpen(true)
    setValues(loaded.values)
    setSendEmpty(loaded.sendEmpty)
    setJson(loaded.json)
    setJsonMode(loaded.jsonMode)
    setWarnings([])
    setInputIssue(null)
  }, [digest, replay, tool.inputSchema, tool.name, viewKey])

  const constraintText = (field: ToolField, constraint: string) =>
    t(`webmcp.tools.constraint.${constraint}` as I18nKey, {
      field: redactWebMcpText(field.name),
      bound: webMcpResultPreview(
        field.constraints?.[constraint],
        ["default", "enum"].includes(constraint) ? field.name : undefined,
      ),
    })
  const showResult = (next: { outcome: string; text: string } | null) => {
    setResult(next ? { outcome: next.outcome, text: next.text, stale: false } : null)
    if (next) recordToolRun(tool.name, { digest, outcome: next.outcome, text: next.text, stale: false }, viewKey)
    else clearToolRun(tool.name, viewKey)
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
    const started = performance.now()
    const state = useWebMcpBrowserStore.getState()
    const source = viewKey ? state.views[viewKey] : state
    const remember = (next: { outcome: string; text: string }) => {
      const currentState = useWebMcpBrowserStore.getState()
      const current = viewKey ? currentState.views[viewKey] : currentState
      if (
        !source ||
        !current ||
        current.origin !== source.origin ||
        current.browserId !== source.browserId
      )
        return
      showResult(next)
      recordToolJournal(
        {
          id: createWebMcpJournalId(),
          tool: tool.name,
          input,
          outcome: next.outcome,
          text: next.text,
          durationMs: performance.now() - started,
          digest,
          definitionDigest: binding.definitionDigest ?? undefined,
          definitionChanged: current.generation !== source.generation,
          at: Date.now(),
        },
        viewKey,
      )
    }
    try {
      const reply = await tryTool(tool.name, input, binding)
      const returnedOutcome = desktopWebMcpResultOutcome({ status: "completed", output: reply.output })
      const returnedFailure = returnedOutcome !== "completed" && returnedOutcome !== null
      const outcome = returnedFailure ? returnedOutcome : (reply.outcome ?? (reply.ok ? "completed" : "failed"))
      const reason = returnedFailure ? returnedOutcome : reply.reason
      const knownReason = (WEBMCP_FAILURE_REASONS as readonly string[]).includes(reason ?? "")
        ? reason
        : "native-failure"
      const label =
        outcome === "stale-form"
          ? t("webmcp.tools.staleForm")
          : outcome === "completed"
            ? t("webmcp.tools.completed")
            : outcome === "uncertain"
              ? `${t("webmcp.tools.uncertain")} ${t(`chat.toolPart.webmcp.reason.${knownReason}` as I18nKey)}`
              : t(`chat.toolPart.webmcp.reason.${knownReason}` as I18nKey)
      remember({ outcome, text: [label, webMcpResultPreview(reply.output)].filter(Boolean).join("\n") })
    } catch {
      // IPC can disappear after the invocation was sent. Never infer failure or offer an automatic retry.
      remember({
        outcome: "uncertain",
        text: `${t("webmcp.tools.uncertain")} ${t("chat.toolPart.webmcp.reason.provider-gone")}`,
      })
    } finally {
      setRunning(false)
    }
  }

  return (
    <li className="rounded border border-border/60" data-webmcp-tool={redactWebMcpText(tool.name)}>
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
          <span className="block truncate font-mono typography-meta text-foreground">
            {redactWebMcpText(tool.name)}
          </span>
          {tool.description ? (
            <span
              className="block truncate typography-micro text-muted-foreground"
              title={redactWebMcpText(tool.description)}
            >
              {redactWebMcpText(tool.description)}
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
              {redactWebMcpText(tool.description)}
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
                      <span className="font-mono">{redactWebMcpText(field.name)}</span>
                      {field.required ? " *" : ""} · {field.kind}
                      {field.description ? ` — ${redactWebMcpText(field.description)}` : ""}
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
                      {t("webmcp.tools.sendEmpty", { field: redactWebMcpText(field.name) })}
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
                  {redactWebMcpText(result.text)}
                </pre>
              </>
            ) : null}
            {result?.outcome === "uncertain" ? (
              <p className="typography-micro">{t("webmcp.tools.inspectPage")}</p>
            ) : null}
          </div>
          <ToolCompare tool={tool} journalEntry={journalEntry} agentCall={agentCall} />
        </div>
      ) : null}
    </li>
  )
}

export type TryToolBinding = { origin: string | null; generation: string | null; definitionDigest: string | null }
export type TryTool = (toolName: string, input: Record<string, unknown>, binding: TryToolBinding) => Promise<TryResult>

/**
 * The tools the current page registers, visible before the agent is granted anything. "Try it" runs a tool on the page as
 * the user, the same as using the page; it creates no agent grant and adds nothing to the conversation.
 * Hint badges and authoring notes never approve a call. A rejected registration is named here and does not hide the page.
 */
export function WebMcpToolPanel({
  tryTool,
  viewKey,
  agentCalls = [],
}: {
  tryTool: TryTool
  viewKey?: string
  agentCalls?: readonly WebMcpCall[]
}) {
  const { t } = useI18n()
  const currentKey = useCurrentWebMcpViewKey()
  const pooled = useWebMcpBrowserStore((state) => state.activeKey !== null || state.order.length > 0)
  const toolViewKey = viewKey ?? (pooled ? currentKey : undefined)
  const catalog = useWebMcpBrowserValue((state) => state.catalog, viewKey)
  const origin = useWebMcpBrowserValue((state) => state.origin, viewKey)
  const generation = useWebMcpBrowserValue((state) => state.generation, viewKey)
  const catalogLimit = useWebMcpBrowserValue((state) => state.catalogLimit, viewKey)
  const catalogRejection = useWebMcpBrowserValue((state) => state.catalogRejection, viewKey)
  const registration = useWebMcpBrowserValue((state) => state.registration, viewKey)
  const journal = useWebMcpBrowserValue((state) => state.toolJournal, viewKey)
  const [replay, setReplay] = React.useState<{
    id: string
    tool: string
    input: Record<string, unknown>
    nonce: number
  } | null>(null)
  const replayNonce = React.useRef(0)
  const [open, setOpen] = React.useState(false)
  React.useEffect(() => {
    if (replay && !journal.some((entry) => entry.id === replay.id)) setReplay(null)
  }, [journal, replay])
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
          data-webmcp-catalog-rejection-tool={redactWebMcpText(catalogRejection.tool)}
          className="px-2.5 pb-1 typography-micro text-[var(--status-error)]"
        >
          {t("webmcp.tools.rejection.title")}{" "}
          {t(REJECTION_TEXT[catalogRejection.reason], {
            tool: redactWebMcpText(catalogRejection.tool) || t("webmcp.tools.rejection.unnamed"),
          })}
        </p>
      ) : null}
      {open ? (
        <div className="space-y-2 px-2.5 pb-2">
          <p className="typography-micro text-muted-foreground">
            {t("webmcp.tools.origin", { origin: redactWebMcpText(origin) })}
          </p>
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
                      name: redactWebMcpText(event.name),
                      digest: shortDigest(event.digest),
                      previous: shortDigest(event.previousDigest ?? ""),
                    })}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          <div className="space-y-1" data-webmcp-journal="" data-webmcp-journal-count={journal.length}>
            <p className="typography-micro text-muted-foreground">{t("webmcp.tools.journal.title")}</p>
            <p className="typography-micro text-muted-foreground">{t("webmcp.tools.journal.memory")}</p>
            {journal.length === 0 ? (
              <p className="typography-micro text-muted-foreground">{t("webmcp.tools.journal.empty")}</p>
            ) : (
              <ol className="space-y-0.5">
                {journal.map((entry) => (
                  <li
                    key={entry.id}
                    data-webmcp-journal-entry={entry.id}
                    data-webmcp-journal-tool={redactWebMcpText(entry.tool)}
                    data-webmcp-journal-outcome={entry.outcome}
                    data-webmcp-journal-digest={entry.digest}
                    data-webmcp-journal-duration={entry.durationMs}
                    data-webmcp-journal-definition-changed={entry.definitionChanged || undefined}
                    className="flex flex-wrap items-center gap-1"
                  >
                    {entry.definitionChanged ? <span>{t("chat.toolPart.webmcp.reason.definition-changed")}</span> : null}
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      data-webmcp-replay={entry.id}
                      onClick={() => {
                        replayNonce.current += 1
                        setReplay({
                          id: entry.id,
                          tool: entry.tool,
                          input: entry.input,
                          nonce: replayNonce.current,
                        })
                      }}
                    >
                      {t("webmcp.tools.journal.replay", {
                        tool: redactWebMcpText(entry.tool),
                        outcome: entry.outcome,
                        duration: formatDuration(entry.durationMs),
                      })}
                    </Button>
                    <span className="font-mono typography-micro text-muted-foreground">
                      {t("webmcp.tools.journal.digest", { digest: shortDigest(entry.digest) })}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <ul className="max-h-72 space-y-1.5 overflow-auto">
            {catalog.map((tool) => (
              <ToolItem
                key={`${toolViewKey ?? ""}:${origin}:${generation}:${tool.name}:${tool.definitionDigest ?? tool.digest ?? ""}`}
                tool={tool}
                binding={{ origin, generation, definitionDigest: tool.definitionDigest ?? null }}
                tryTool={tryTool}
                viewKey={toolViewKey}
                journalEntry={journal.find((entry) => entry.tool === tool.name) ?? null}
                replay={replay?.tool === tool.name ? replay : null}
                agentCall={
                  agentCalls.find(
                    (call) => call.operation?.toLowerCase() === "invoke" && call.toolName === tool.name,
                  ) ?? null
                }
              />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
