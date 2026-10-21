import { isPlainRecord } from "@/lib/record"
import { truncateToCodeUnits } from "@/lib/textTruncate"

interface ToolMetadata {
  displayName: string
  icon?: string
  outputLanguage?: string
  inputFields?: {
    key: string
    label: string
    type: "command" | "file" | "pattern" | "text" | "code"
    language?: string
  }[]
  category: "file" | "search" | "code" | "system" | "ai" | "web"
}

const TOOL_METADATA: Record<string, ToolMetadata> = {
  read: {
    displayName: "Read File",
    category: "file",
    outputLanguage: "auto",
    inputFields: [
      { key: "filePath", label: "File Path", type: "file" },
      { key: "offset", label: "Start Line", type: "text" },
      { key: "limit", label: "Lines to Read", type: "text" },
    ],
  },
  write: {
    displayName: "Write File",
    category: "file",
    outputLanguage: "auto",
    inputFields: [
      { key: "filePath", label: "File Path", type: "file" },
      { key: "content", label: "Content", type: "code" },
    ],
  },
  edit: {
    displayName: "Edit File",
    category: "file",
    outputLanguage: "diff",
    inputFields: [
      { key: "filePath", label: "File Path", type: "file" },
      { key: "oldString", label: "Find", type: "code" },
      { key: "newString", label: "Replace", type: "code" },
      { key: "replaceAll", label: "Replace All", type: "text" },
    ],
  },
  multiedit: {
    displayName: "Multi-Edit",
    category: "file",
    outputLanguage: "diff",
    inputFields: [
      { key: "filePath", label: "File Path", type: "file" },
      { key: "edits", label: "Edits", type: "code", language: "json" },
    ],
  },
  apply_patch: {
    displayName: "Apply Patch",
    category: "file",
    outputLanguage: "diff",
    inputFields: [{ key: "patchText", label: "Patch", type: "code", language: "diff" }],
  },

  bash: {
    displayName: "Shell Command",
    category: "system",
    outputLanguage: "text",
    inputFields: [
      { key: "command", label: "Command", type: "command", language: "bash" },
      { key: "description", label: "Description", type: "text" },
      { key: "timeout", label: "Timeout (ms)", type: "text" },
    ],
  },

  grep: {
    displayName: "Search Files",
    category: "search",
    outputLanguage: "text",
    inputFields: [
      { key: "pattern", label: "Pattern", type: "pattern" },
      { key: "path", label: "Directory", type: "file" },
      { key: "include", label: "Include Pattern", type: "pattern" },
    ],
  },
  glob: {
    displayName: "Find Files",
    category: "search",
    outputLanguage: "text",
    inputFields: [
      { key: "pattern", label: "Pattern", type: "pattern" },
      { key: "path", label: "Directory", type: "file" },
    ],
  },
  list: {
    displayName: "List Directory",
    category: "file",
    outputLanguage: "text",
    inputFields: [
      { key: "path", label: "Directory", type: "file" },
      { key: "ignore", label: "Ignore Patterns", type: "pattern" },
    ],
  },

  task: {
    displayName: "Agent Task",
    category: "ai",
    outputLanguage: "markdown",
    inputFields: [
      { key: "description", label: "Task", type: "text" },
      { key: "prompt", label: "Instructions", type: "text" },
      { key: "subagent_type", label: "Agent Type", type: "text" },
    ],
  },

  webfetch: {
    displayName: "Fetch URL",
    category: "web",
    outputLanguage: "auto",
    inputFields: [
      { key: "url", label: "URL", type: "text" },
      { key: "format", label: "Format", type: "text" },
      { key: "timeout", label: "Timeout", type: "text" },
    ],
  },

  websearch: {
    displayName: "Web Search",
    category: "web",
    outputLanguage: "markdown",
    inputFields: [
      { key: "query", label: "Search Query", type: "text" },
      { key: "numResults", label: "Results Count", type: "text" },
      { key: "type", label: "Search Type", type: "text" },
    ],
  },
  codesearch: {
    displayName: "Code Search",
    category: "web",
    outputLanguage: "markdown",
    inputFields: [
      { key: "query", label: "Search Query", type: "text" },
      { key: "tokensNum", label: "Tokens", type: "text" },
    ],
  },

  todowrite: {
    displayName: "Update Todo List",
    category: "system",
    outputLanguage: "json",
    inputFields: [{ key: "todos", label: "Todo Items", type: "code", language: "json" }],
  },
  todoread: {
    displayName: "Read Todo List",
    category: "system",
    outputLanguage: "json",
    inputFields: [],
  },
  skill: {
    displayName: "Load Skill",
    category: "ai",
    outputLanguage: "markdown",
    inputFields: [{ key: "name", label: "Skill Name", type: "text" }],
  },
  question: {
    displayName: "Question",
    category: "ai",
    outputLanguage: "text",
    inputFields: [{ key: "questions", label: "Questions", type: "code", language: "json" }],
  },

  plan_enter: {
    displayName: "Plan Mode",
    category: "ai",
    outputLanguage: "text",
    inputFields: [],
  },

  plan_exit: {
    displayName: "Build Mode",
    category: "ai",
    outputLanguage: "text",
    inputFields: [],
  },

  StructuredOutput: {
    displayName: "Structured Output",
    category: "ai",
    outputLanguage: "json",
    inputFields: [],
  },

  structuredoutput: {
    displayName: "Structured Output",
    category: "ai",
    outputLanguage: "json",
    inputFields: [],
  },
}

function formatUnknownToolDisplayName(toolName: string): string {
  return toolName
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^./, (char) => char.toUpperCase())
}

/**
 * Same credential shapes as the activity preview. Used only to mask text on screen.
 * Callers must not write the original value, an element ref, or a grant to storage.
 */
const WEBMCP_CREDENTIALS: readonly RegExp[] = [
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/,
  /\b(?:sk|rk)-[A-Za-z0-9][A-Za-z0-9_-]{16,}/,
  /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{16,}/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bBearer\s+\S{16,}/i,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
  // Any value after a credential keyword, however short (password=hunter2 must not show).
  /\b(?:api[_-]?key|secret|token|password|passwd|passphrase|access[_-]?key|authorization|cookie)\s*[:=]\s*['"]?\S+/i,
]

/** Key or field names whose values are never shown, whatever the value looks like. */
const WEBMCP_SENSITIVE_NAME =
  /password|passwd|passphrase|secret|token|credential|api.?key|private.?key|authorization|bearer|cookie|session|otp|one.?time|pin\b|cvv|cvc|card.?number|recovery|seed/i

const WEBMCP_TEXT_LIMIT = 140

/** Shown when an invoke request has no arguments object. Matches the en catalog verbatim. */
export const WEBMCP_ARGUMENTS_MISSING = "arguments not provided by the runtime"

const WEBMCP_FAILURE_STATUSES = /^(error|failed|canceled|cancelled|timeout|aborted)$/i

export interface WebMcpElementDetails {
  ref: string
  kind: string
  name: string
  submit: boolean
}

export type WebMcpDisplayedText = { redacted: true } | { redacted: false; value: string }

export interface WebMcpCallDescription {
  toolName: string | null
  operation: string | null
  how: string | null
  element: WebMcpElementDetails | null
  text: WebMcpDisplayedText | null
  argumentsMissing: boolean
  argumentsText: string | null
  /** Runtime failure code (AX Code ADR-266), when the runtime sends one. */
  failureReason: WebMcpFailureReason | null
  /** The single next step the runtime suggests after a failure, credential-filtered. */
  nextAction: string | null
}

export const WEBMCP_FAILURE_REASONS = [
  "no-page",
  "page-changed",
  "tool-not-found",
  "definition-changed",
  "invalid-input",
  "input-too-large",
  "result-too-large",
  "provider-gone",
  "timeout",
  "native-failure",
  "application-error",
  "cancelled",
] as const
export type WebMcpFailureReason = (typeof WEBMCP_FAILURE_REASONS)[number]

const WEBMCP_PREVIEW_LIMIT = 600

export interface ToolMetadataContext {
  input?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
}

export function isWebMcpToolName(toolName: string): boolean {
  const tool = toolName.trim().toLowerCase()
  return tool === "webmcp" || tool === "desktop_webmcp"
}

function readWebMcpString(record: Record<string, unknown> | null | undefined, key: string): string | null {
  if (!record) return null
  const value = record[key]
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function webMcpTextLooksSensitive(value: string): boolean {
  return WEBMCP_CREDENTIALS.some((pattern) => pattern.test(value))
}

/** Collapse whitespace, drop credential-like text, and cap the visible remainder. */
export function redactDisplayedText(value: string): WebMcpDisplayedText | null {
  const collapsed = value.replace(/\s+/g, " ").trim()
  if (!collapsed) return null
  if (webMcpTextLooksSensitive(value) || webMcpTextLooksSensitive(collapsed)) return { redacted: true }
  return { redacted: false, value: truncateToCodeUnits(collapsed, WEBMCP_TEXT_LIMIT) }
}

/** Text typed into a field whose name or kind marks it sensitive is never shown, even when the text itself looks ordinary. */
function redactActText(value: string, element: WebMcpElementDetails | null): WebMcpDisplayedText | null {
  if (element && WEBMCP_SENSITIVE_NAME.test(`${element.name} ${element.kind}`) && value.trim())
    return { redacted: true }
  return redactDisplayedText(value)
}

/** True for a field or key whose value is never shown (password, token, card number and the like). */
export function isWebMcpSensitiveName(name: string): boolean {
  return WEBMCP_SENSITIVE_NAME.test(name)
}

/** A copy of a tool input safe to show: secret-named fields and credential-shaped text become "[redacted]". */
export function redactWebMcpInput(value: unknown): unknown {
  return redactJsonValue(value)
}

/** A copy for export: secret-named fields become a placeholder to fill in, so a copied test never carries the secret. */
export function placeholderWebMcpSecrets(value: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value))
    next[key] =
      WEBMCP_SENSITIVE_NAME.test(key) && entry !== null && entry !== "" ? "<fill in>" : placeholderWebMcpValue(entry)
  return next
}

function placeholderWebMcpValue(value: unknown): unknown {
  if (typeof value === "string" && webMcpTextLooksSensitive(value)) return "<fill in>"
  if (Array.isArray(value)) return value.map(placeholderWebMcpValue)
  if (value && typeof value === "object") return placeholderWebMcpSecrets(value as Record<string, unknown>)
  return value
}

function redactJsonValue(value: unknown): unknown {
  if (typeof value === "string") {
    const displayed = redactDisplayedText(value)
    if (!displayed) return ""
    return displayed.redacted ? "[redacted]" : displayed.value
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value
  if (Array.isArray(value)) return value.map((entry) => redactJsonValue(entry))
  if (isPlainRecord(value)) {
    const next: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value))
      next[key] =
        WEBMCP_SENSITIVE_NAME.test(key) && entry !== null && entry !== "" ? "[redacted]" : redactJsonValue(entry)
    return next
  }
  return null
}

/** Bounded, credential-filtered manual result preview. Results remain inert text, never HTML. */
export function webMcpResultPreview(output: unknown, fieldName?: string): string {
  if (output === undefined) return ""
  if (fieldName && WEBMCP_SENSITIVE_NAME.test(fieldName)) return "[redacted]"
  let remaining = 256
  const seen = new WeakSet<object>()
  const visit = (value: unknown, depth: number): unknown => {
    if (--remaining < 0 || depth > 8) return "…"
    if (typeof value === "string") {
      // Filter the entire string before truncating so a credential past the preview boundary cannot leak.
      if (webMcpTextLooksSensitive(value)) return "[redacted]"
      return truncateToCodeUnits(value, 4000)
    }
    if (typeof value === "number" || typeof value === "boolean" || value === null) return value
    if (!value || typeof value !== "object") return null
    if (seen.has(value)) return "…"
    seen.add(value)
    if (Array.isArray(value)) return value.slice(0, 64).map((entry) => visit(entry, depth + 1))
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 64)
        .map(([key, entry]) => [
          webMcpTextLooksSensitive(key) ? "[redacted]" : truncateToCodeUnits(key, 140),
          WEBMCP_SENSITIVE_NAME.test(key) ? "[redacted]" : visit(entry, depth + 1),
        ]),
    )
  }
  try {
    // JSON strings need the same sensitive-name filtering as object outputs.
    let value = output
    if (typeof value === "string") {
      try {
        value = JSON.parse(value)
      } catch {
        /* Plain text is also supported. */
      }
    }
    const safe = visit(value, 0)
    return truncateToCodeUnits(typeof safe === "string" ? safe : (JSON.stringify(safe, null, 2) ?? ""), 4000)
  } catch {
    return ""
  }
}

function readWebMcpElement(record: Record<string, unknown> | null | undefined): WebMcpElementDetails | null {
  if (!record || !isPlainRecord(record.element)) return null
  const element = record.element
  const ref = readWebMcpString(element, "ref") ?? ""
  const kind = readWebMcpString(element, "kind") ?? ""
  const name = readWebMcpString(element, "name") ?? ""
  if (!ref && !kind && !name) return null
  return { ref, kind, name, submit: element.submit === true }
}

function readWebMcpArguments(metadata: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!metadata) return null
  for (const candidate of [metadata.arguments, metadata.input]) {
    if (!isPlainRecord(candidate) || Object.keys(candidate).length === 0) continue
    return candidate
  }
  return null
}

const DEFINITION_DIGEST = /^[a-f0-9]{8,64}$/

/** The definition digest a runtime attached to a call, when it sent one. Never invented. */
export function readWebMcpDefinitionDigest(metadata: Record<string, unknown> | null | undefined): string | null {
  if (!metadata) return null
  for (const key of ["definitionDigest", "schemaDigest", "digest"]) {
    const value = metadata[key]
    if (typeof value === "string" && DEFINITION_DIGEST.test(value)) return value
  }
  return null
}

export type WebMcpInvokeInputKind = "object" | "preview" | "unparsed" | "redacted" | "missing"

/**
 * The invoke input a diagnosis may check. Arguments come only from `metadata.arguments`, `metadata.input`, or the
 * ADR-266 `inputPreview`. The model payload under `input.input` is not a receipt and is never guessed from.
 * Sensitive values are redacted; other strings are kept whole so a length check sees the real size.
 */
export function readWebMcpInvokeInput(metadata: Record<string, unknown> | null | undefined): {
  kind: WebMcpInvokeInputKind
  input: Record<string, unknown> | null
} {
  const args = readWebMcpArguments(metadata)
  if (args) return { kind: "object", input: redactInvokeRecord(args) }
  const preview = readWebMcpString(metadata, "inputPreview")
  if (!preview) return { kind: "missing", input: null }
  if (webMcpTextLooksSensitive(preview)) return { kind: "redacted", input: null }
  try {
    const parsed: unknown = JSON.parse(preview)
    if (isPlainRecord(parsed)) return { kind: "preview", input: redactInvokeRecord(parsed) }
  } catch {
    /* A truncated or non-JSON preview is not a property bag. */
  }
  return { kind: "unparsed", input: null }
}

function redactInvokeRecord(value: Record<string, unknown>): Record<string, unknown> {
  const budget = { left: 256 }
  const redacted = redactInvokeValue(value, budget, 0)
  return isPlainRecord(redacted) ? redacted : {}
}

function redactInvokeValue(value: unknown, budget: { left: number }, depth: number): unknown {
  if (budget.left <= 0 || depth > 8) return "…"
  budget.left -= 1
  if (typeof value === "string") return webMcpTextLooksSensitive(value) ? "[redacted]" : value
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value
  if (Array.isArray(value)) return value.slice(0, 64).map((entry) => redactInvokeValue(entry, budget, depth + 1))
  if (isPlainRecord(value)) {
    const next: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value).slice(0, 128)) {
      next[key] =
        WEBMCP_SENSITIVE_NAME.test(key) && entry !== null && entry !== ""
          ? "[redacted]"
          : redactInvokeValue(entry, budget, depth + 1)
    }
    return next
  }
  return null
}

/**
 * Fields the runtime already attaches to a WebMCP call. Invoke arguments come only from
 * `metadata.arguments` or `metadata.input`. The model payload under `input.input` is not a receipt.
 */
export function describeWebMcpCall(
  input?: Record<string, unknown> | null,
  metadata?: Record<string, unknown> | null,
): WebMcpCallDescription {
  const toolName =
    readWebMcpString(metadata, "toolName") || readWebMcpString(input, "toolName") || readWebMcpString(input, "tool")
  const operation =
    readWebMcpString(metadata, "operation") ||
    readWebMcpString(input, "action") ||
    readWebMcpString(input, "operation") ||
    readWebMcpString(metadata, "action")
  const normalized = operation?.toLowerCase() ?? ""
  const act = normalized === "act"
  const rawText = act ? readWebMcpString(metadata, "text") || readWebMcpString(input, "text") : null
  let argumentsMissing = false
  let argumentsText: string | null = null
  if (normalized === "invoke") {
    const args = readWebMcpArguments(metadata)
    // Newer runtimes (ADR-266) send `inputPreview`: the exact input, already redacted and capped. It is still filtered here.
    const preview = readWebMcpString(metadata, "inputPreview")
    if (args) argumentsText = truncateToCodeUnits(JSON.stringify(redactJsonValue(args), null, 2), WEBMCP_TEXT_LIMIT)
    else if (preview)
      argumentsText = webMcpTextLooksSensitive(preview)
        ? "[redacted]"
        : truncateToCodeUnits(preview, WEBMCP_PREVIEW_LIMIT)
    else argumentsMissing = true
  }
  const reason = readWebMcpString(metadata, "reason")
  const failureReason = (WEBMCP_FAILURE_REASONS as readonly string[]).includes(reason ?? "")
    ? (reason as WebMcpFailureReason)
    : null
  const rawNext = readWebMcpString(metadata, "nextAction")
  const nextAction =
    rawNext && !webMcpTextLooksSensitive(rawNext) ? truncateToCodeUnits(rawNext.replace(/\s+/g, " ").trim(), 300) : null
  return {
    toolName,
    operation,
    how: act ? readWebMcpString(metadata, "how") || readWebMcpString(input, "how") : null,
    element: act ? (readWebMcpElement(metadata) ?? readWebMcpElement(input)) : null,
    text: rawText
      ? redactActText(rawText, act ? (readWebMcpElement(metadata) ?? readWebMcpElement(input)) : null)
      : null,
    argumentsMissing,
    argumentsText,
    failureReason,
    nextAction,
  }
}

export type WebMcpEffectKey =
  | "invoke"
  | "click"
  | "clickSubmit"
  | "type"
  | "select"
  | "navigate"
  | "other"

/**
 * One plain sentence for an approval, built only from what the runtime sent about the call (operation, element, submit
 * flag, origin). A page's own tool description is never used: the site could word it to look harmless.
 */
export function webMcpEffect(
  call: Pick<WebMcpCallDescription, "operation" | "toolName" | "how" | "element">,
  origin: string,
): { key: WebMcpEffectKey; params: { tool: string; target: string; origin: string } } {
  const operation = call.operation?.toLowerCase() ?? ""
  // The element's name comes from the page, so it is capped; the sentence's structure never comes from the page.
  const target = call.element ? truncateToCodeUnits(call.element.name || call.element.ref || call.element.kind, 80) : ""
  const params = { tool: call.toolName ?? "", target, origin: origin || "—" }
  if (operation === "invoke" && call.toolName) return { key: "invoke", params }
  if (operation === "navigate") return { key: "navigate", params }
  if (operation === "act" && target) {
    if (call.how === "type") return { key: "type", params }
    if (call.how === "select") return { key: "select", params }
    if (call.how === "click") return { key: call.element?.submit ? "clickSubmit" : "click", params }
  }
  return { key: "other", params }
}

/** Page tool name when the runtime sent one, otherwise the operation. Null when neither is present. */
export function desktopWebMcpRowTitle(
  input?: Record<string, unknown> | null,
  metadata?: Record<string, unknown> | null,
): string | null {
  const call = describeWebMcpCall(input, metadata)
  return call.toolName || call.operation
}

function webMcpResultRecord(output: unknown): Record<string, unknown> | null {
  let parsed: unknown = output
  if (typeof output === "string") {
    const trimmed = output.trim()
    if (!trimmed) return null
    try {
      parsed = JSON.parse(trimmed) as unknown
    } catch {
      return null
    }
  }
  if (!isPlainRecord(parsed)) return null
  if (parsed.untrusted === true && isPlainRecord(parsed.result)) return parsed.result
  return parsed
}

/** Explicit timeout/cancellation wins over generic error flags, including returned result envelopes. */
export function desktopWebMcpResultOutcome(
  state: { status?: unknown; output?: unknown } | null | undefined,
): "completed" | "application-error" | "timeout" | "cancelled" | null {
  const terminalStatus = (status: unknown) => {
    if (typeof status !== "string") return null
    if (/^timeout$/i.test(status.trim())) return "timeout" as const
    if (/^(canceled|cancelled|aborted)$/i.test(status.trim())) return "cancelled" as const
    return null
  }
  const status = typeof state?.status === "string" ? state.status : ""
  const terminal = terminalStatus(status)
  if (terminal) return terminal
  if (["error", "failed"].includes(status)) return "application-error"
  if (status !== "completed") return null
  const result = webMcpResultRecord(state?.output)
  const returnedTerminal = terminalStatus(result?.status)
  if (returnedTerminal) return returnedTerminal
  if (
    result &&
    (result.isError === true ||
      result.ok === false ||
      (typeof result.status === "string" && WEBMCP_FAILURE_STATUSES.test(result.status.trim())) ||
      (typeof result.error === "string" && result.error.trim().length > 0) ||
      // A structured error, as the builder guide recommends: { error: { field, constraint, got } }.
      (result.error !== null &&
        typeof result.error === "object" &&
        !Array.isArray(result.error) &&
        Object.keys(result.error).length > 0) ||
      (typeof result.errorText === "string" && result.errorText.trim().length > 0))
  )
    return "application-error"
  return "completed"
}

/** Transport completion can still carry a failed page-tool result; found:false and done:true are normal. */
export function desktopWebMcpResultFailed(state: { status?: unknown; output?: unknown } | null | undefined): boolean {
  const outcome = desktopWebMcpResultOutcome(state)
  return outcome !== null && outcome !== "completed"
}

function formatWebMcpToolInput(input: Record<string, unknown>): string {
  const call = describeWebMcpCall(input, undefined)
  const lines: string[] = []
  if (call.operation) lines.push(`Operation: ${call.operation}`)
  if (call.toolName) lines.push(`Tool: ${call.toolName}`)
  if (call.how) lines.push(`Action: ${call.how}`)
  if (call.element) {
    const label = [call.element.ref, call.element.kind, call.element.name].filter(Boolean).join(" ")
    if (label) lines.push(`Target: ${label}`)
    lines.push(call.element.submit ? "Submits the form" : "Does not submit")
  }
  if (call.text?.redacted) lines.push("Text redacted")
  else if (call.text) lines.push(`Text: ${call.text.value}`)
  if (call.argumentsMissing) lines.push(WEBMCP_ARGUMENTS_MISSING)
  if (call.argumentsText) lines.push(call.argumentsText)
  return lines.join("\n")
}

export function getToolMetadata(toolName: string, context?: ToolMetadataContext): ToolMetadata {
  if (isWebMcpToolName(toolName)) {
    return {
      displayName: desktopWebMcpRowTitle(context?.input, context?.metadata) ?? formatUnknownToolDisplayName(toolName),
      category: "web",
      outputLanguage: "text",
      inputFields: [],
      icon: "global",
    }
  }
  return (
    TOOL_METADATA[toolName] || {
      displayName: formatUnknownToolDisplayName(toolName),
      category: "system",
      outputLanguage: "text",
      inputFields: [],
    }
  )
}

export function detectToolOutputLanguage(toolName: string, output: string, input?: Record<string, unknown>): string {
  const metadata = getToolMetadata(toolName)

  if (metadata.outputLanguage === "auto") {
    if (input?.filePath || input?.file_path || input?.sourcePath) {
      const filePath = (input.filePath || input.file_path || input.sourcePath) as string
      const language = getLanguageFromExtension(filePath)
      if (language) return language
    }

    if (toolName === "webfetch") {
      if (output.trim().startsWith("{") || output.trim().startsWith("[")) {
        try {
          JSON.parse(output)
          return "json"
        } catch {
          /* ignored */
        }
      }
      if (output.trim().startsWith("<")) {
        return "html"
      }
      if (output.includes("```")) {
        return "markdown"
      }
    }

    return "text"
  }

  return metadata.outputLanguage || "text"
}

export function getLanguageFromExtension(filePath: string): string | null {
  const ext = filePath.split(".").pop()?.toLowerCase()

  // Handle special filenames without extensions
  const filename = filePath.split("/").pop()?.toLowerCase() || ""
  const filenameMap: Record<string, string> = {
    dockerfile: "dockerfile",
    makefile: "makefile",
    gnumakefile: "makefile",
    "cmakelists.txt": "cmake",
    gemfile: "ruby",
    rakefile: "ruby",
    podfile: "ruby",
    vagrantfile: "ruby",
    guardfile: "ruby",
    brewfile: "ruby",
    fastfile: "ruby",
    appfile: "ruby",
    matchfile: "ruby",
    pluginfile: "ruby",
    scanfile: "ruby",
    snapfile: "ruby",
    ".gitignore": "text",
    ".gitattributes": "text",
    ".gitmodules": "ini",
    ".editorconfig": "ini",
    ".npmrc": "ini",
    ".yarnrc": "yaml",
    ".prettierrc": "json",
    ".eslintrc": "json",
    ".babelrc": "json",
    ".browserslistrc": "text",
    "tsconfig.json": "jsonc",
    "jsconfig.json": "jsonc",
    ".env": "bash",
    ".env.local": "bash",
    ".env.development": "bash",
    ".env.production": "bash",
    ".env.test": "bash",
    procfile: "yaml",
    codeowners: "text",
    // Lock files
    "package-lock.json": "json",
    "composer.lock": "json",
    "yarn.lock": "yaml",
    "pnpm-lock.yaml": "yaml",
    "cargo.lock": "toml",
    "poetry.lock": "toml",
    "gemfile.lock": "ruby",
    "pubspec.lock": "yaml",
    "packages.lock.json": "json",
    "bun.lockb": "text",
    "bun.lock": "json",
  }

  if (filenameMap[filename]) {
    return filenameMap[filename]
  }

  const languageMap: Record<string, string> = {
    // JavaScript/TypeScript
    js: "javascript",
    jsx: "jsx",
    ts: "typescript",
    tsx: "tsx",
    mjs: "javascript",
    cjs: "javascript",
    mts: "typescript",
    cts: "typescript",

    // Web markup/styling
    html: "html",
    htm: "html",
    xhtml: "html",
    vue: "html",
    svelte: "html",
    astro: "html",
    ejs: "html",
    hbs: "handlebars",
    handlebars: "handlebars",
    mustache: "handlebars",
    njk: "twig",
    nunjucks: "twig",
    twig: "twig",
    liquid: "liquid",
    css: "css",
    scss: "scss",
    sass: "sass",
    less: "less",
    styl: "stylus",
    stylus: "stylus",
    pcss: "css",
    postcss: "css",

    // Data/config formats
    json: "json",
    jsonc: "json",
    json5: "json",
    jsonl: "json",
    ndjson: "json",
    geojson: "json",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    xml: "xml",
    xsl: "xml",
    xslt: "xml",
    xsd: "xml",
    dtd: "xml",
    plist: "xml",
    svg: "xml",
    rss: "xml",
    atom: "xml",
    xaml: "xml",
    csproj: "xml",
    vbproj: "xml",
    fsproj: "xml",
    props: "xml",
    targets: "xml",
    nuspec: "xml",
    resx: "xml",
    ini: "ini",
    cfg: "ini",
    conf: "ini",
    config: "ini",
    properties: "properties",
    env: "bash",
    csv: "text",
    tsv: "text",

    // Python
    py: "python",
    pyw: "python",
    pyx: "python",
    pxd: "python",
    pxi: "python",
    pyi: "python",
    gyp: "python",
    gypi: "python",
    bzl: "python",

    // Ruby
    rb: "ruby",
    erb: "erb",
    rake: "ruby",
    gemspec: "ruby",
    ru: "ruby",
    podspec: "ruby",
    thor: "ruby",
    jbuilder: "ruby",
    rabl: "ruby",
    builder: "ruby",

    // PHP
    php: "php",
    phtml: "php",
    php3: "php",
    php4: "php",
    php5: "php",
    php7: "php",
    phps: "php",
    inc: "php",
    "blade.php": "php",

    // Java/JVM
    java: "java",
    kt: "kotlin",
    kts: "kotlin",
    scala: "scala",
    sc: "scala",
    groovy: "groovy",
    gradle: "groovy",
    gvy: "groovy",
    gy: "groovy",
    gsh: "groovy",

    // C/C++/Objective-C
    c: "c",
    h: "c",
    cpp: "cpp",
    cc: "cpp",
    cxx: "cpp",
    "c++": "cpp",
    hpp: "cpp",
    hxx: "cpp",
    hh: "cpp",
    "h++": "cpp",
    ino: "cpp",
    m: "objectivec",
    mm: "objectivec",

    // C#/F#/.NET
    cs: "csharp",
    csx: "csharp",
    cake: "csharp",
    fs: "fsharp",
    fsx: "fsharp",
    fsi: "fsharp",
    vb: "vbnet",

    // Go
    go: "go",
    mod: "go",
    sum: "text",

    // Rust
    rs: "rust",

    // Swift
    swift: "swift",

    // Dart
    dart: "dart",

    // Lua
    lua: "lua",

    // Perl
    pl: "perl",
    pm: "perl",
    pod: "perl",
    t: "perl",

    // R
    r: "r",
    R: "r",
    rmd: "markdown",
    rnw: "r",

    // Julia
    jl: "julia",

    // Haskell
    hs: "haskell",
    lhs: "haskell",

    // Elixir/Erlang
    ex: "elixir",
    exs: "elixir",
    eex: "html",
    heex: "html",
    leex: "html",
    erl: "erlang",
    hrl: "erlang",

    // Clojure
    clj: "clojure",
    cljs: "clojure",
    cljc: "clojure",
    edn: "clojure",

    // Lisp/Scheme
    lisp: "lisp",
    cl: "lisp",
    el: "lisp",
    scm: "scheme",
    ss: "scheme",
    rkt: "scheme",

    // OCaml/ReasonML
    ml: "ocaml",
    mli: "ocaml",
    re: "reason",
    rei: "reason",

    // Nim
    nim: "nim",
    nims: "nim",
    nimble: "nim",

    // Zig
    zig: "zig",

    // V
    v: "v",
    vsh: "v",

    // Crystal
    cr: "crystal",

    // D
    d: "d",
    di: "d",

    // Shell/Scripts
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    fish: "bash",
    ksh: "bash",
    csh: "bash",
    tcsh: "bash",
    ps1: "powershell",
    psm1: "powershell",
    psd1: "powershell",
    bat: "batch",
    cmd: "batch",

    // SQL
    sql: "sql",
    psql: "sql",
    plsql: "sql",
    mysql: "sql",
    pgsql: "sql",
    sqlite: "sql",

    // GraphQL
    graphql: "graphql",
    gql: "graphql",

    // Solidity
    sol: "solidity",

    // Assembly
    asm: "nasm",
    s: "nasm",
    S: "nasm",

    // Nix
    nix: "nix",

    // Terraform/HCL
    tf: "hcl",
    tfvars: "hcl",
    hcl: "hcl",

    // Docker
    dockerignore: "text",

    // Puppet
    pp: "puppet",

    // LaTeX
    tex: "latex",
    latex: "latex",
    sty: "latex",
    cls: "latex",
    bib: "bibtex",
    bst: "bibtex",

    // Markdown/docs
    md: "markdown",
    mdx: "markdown",
    markdown: "markdown",
    mdown: "markdown",
    mkd: "markdown",
    rst: "text",
    adoc: "asciidoc",
    asciidoc: "asciidoc",
    org: "text",
    txt: "text",
    text: "text",
    rtf: "text",

    // Vim
    vim: "vim",
    vimrc: "vim",

    // Makefile variants
    mk: "makefile",

    // CMake
    cmake: "cmake",

    // Diff/Patch
    diff: "diff",
    patch: "diff",

    // Prisma
    prisma: "prisma",

    // Protocol Buffers
    proto: "protobuf",

    // Thrift
    thrift: "thrift",

    // WASM
    wat: "wasm",
    wast: "wasm",

    // GLSL/Shaders
    glsl: "glsl",
    vert: "glsl",
    frag: "glsl",
    geom: "glsl",
    comp: "glsl",
    hlsl: "hlsl",
    fx: "hlsl",
    cg: "cg",
    shader: "glsl",

    // Apache/Nginx config
    htaccess: "apacheconf",
    nginx: "nginx",

    // Kubernetes
    kubeconfig: "yaml",

    // Ansible
    ansible: "yaml",
  }

  return languageMap[ext || ""] || null
}

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp", "avif"]

export function isImageFile(filePath: string): boolean {
  const ext = filePath.split(".").pop()?.toLowerCase()
  return IMAGE_EXTENSIONS.includes(ext || "")
}

export function getImageMimeType(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase()
  const mimeMap: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    webp: "image/webp",
    ico: "image/x-icon",
    bmp: "image/bmp",
    avif: "image/avif",
  }
  return mimeMap[ext || ""] || "image/png"
}

export function formatToolInput(input: Record<string, unknown>, toolName: string): string {
  if (!input) return ""

  const getString = (key: string): string | null => {
    const val = input[key]
    return typeof val === "string" ? val : typeof val === "number" ? String(val) : null
  }

  if (toolName === "bash") {
    const cmd = getString("command")
    if (cmd) return cmd
  }

  if (toolName === "task") {
    const prompt = getString("prompt")
    if (prompt) return prompt
    const desc = getString("description")
    if (desc) return desc
  }

  if (toolName === "apply_patch" && typeof input === "object") {
    const patchText = getString("patchText") || getString("patch_text") || getString("patch")
    if (patchText) {
      return patchText
    }
  }

  if ((toolName === "edit" || toolName === "multiedit") && typeof input === "object") {
    const filePath = getString("filePath") || getString("file_path") || getString("path")
    if (filePath) {
      return `File path: ${filePath}`
    }
  }

  if (toolName === "write" && typeof input === "object") {
    const content = getString("content")
    if (content) {
      return content
    }
  }

  if (isWebMcpToolName(toolName)) {
    return formatWebMcpToolInput(input)
  }

  if (typeof input === "object") {
    const entries = Object.entries(input)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .map(([key, value]) => {
        const formattedKey = key
          .replace(/([A-Z])/g, " $1")
          .replace(/_/g, " ")
          .toLowerCase()
          .replace(/^./, (str) => str.toUpperCase())

        let formattedValue = value
        if (typeof value === "object") {
          formattedValue = JSON.stringify(value, null, 2)
        } else if (typeof value === "boolean") {
          formattedValue = value ? "Yes" : "No"
        }

        return `${formattedKey}: ${formattedValue}`
      })

    return entries.join("\n")
  }

  return String(input)
}
