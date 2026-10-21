import { webMcpTextLooksSensitive } from "../../../../shared/webmcp-redaction.mjs"
import { webMcpEvidenceMatchesTool, type WebMcpJournalEntry, type WebMcpToolDefinition } from "./webMcpCatalog"
import { placeholderWebMcpSecrets } from "./toolHelpers"
import { diagnosisFields, diagnosisOpaqueRequired, toolInputWarnings, type ToolField } from "./webMcpToolForm"

/**
 * Advisory check of one input against the tool's current schema. It names the failing property, the rule and the
 * value's kind. It never decides whether a call may run; the page does.
 */
export type WebMcpDiagnosisRule = "required" | "type" | "enum" | "minimum" | "maximum" | "minLength" | "maxLength"

export type WebMcpValueKind = "absent" | "null" | "array" | "object" | "string" | "number" | "boolean" | "integer"

export type WebMcpDiagnosisFinding = {
  property: string
  rule: WebMcpDiagnosisRule
  valueKind: WebMcpValueKind
  /** The schema type a `type` failure expected. */
  expected?: "string" | "number" | "integer" | "boolean"
}

export type WebMcpDiagnosis =
  | { status: "unchecked"; reason: "no-schema" | "unsupported-schema" }
  | { status: "checked"; findings: WebMcpDiagnosisFinding[]; uncheckable?: string[] }

const RULES = new Set<WebMcpDiagnosisRule>(["required", "type", "enum", "minimum", "maximum", "minLength", "maxLength"])

/** The kind of a JSON value. Integers are distinguished from other numbers so a fractional misuse is visible. */
export function webMcpValueKind(value: unknown): WebMcpValueKind {
  if (value === null) return "null"
  if (Array.isArray(value)) return "array"
  if (typeof value === "string") return "string"
  if (typeof value === "boolean") return "boolean"
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number"
  return "object"
}

function typeOk(field: ToolField, value: unknown): boolean {
  if (field.kind === "string" || field.kind === "enum") return typeof value === "string"
  if (field.kind === "boolean") return typeof value === "boolean"
  if (field.kind === "number") return typeof value === "number" && Number.isFinite(value)
  return typeof value === "number" && Number.isInteger(value)
}

function expectedType(field: ToolField): WebMcpDiagnosisFinding["expected"] {
  if (field.kind === "enum") return "string"
  return field.kind
}

/**
 * Check `input` against the current schema. Constraint comparisons are `toolInputWarnings`; type and required are
 * added here. Findings stay in schema order. A wrong type suppresses range checks on that property.
 */
export function diagnoseWebMcpInput(schema: unknown, input: Record<string, unknown>): WebMcpDiagnosis {
  if (schema === undefined) return { status: "unchecked", reason: "no-schema" }
  const fields = diagnosisFields(schema)
  const findings: WebMcpDiagnosisFinding[] = []
  // The display projection can hide a complete property definition. Absence of a check is not a pass.
  const properties = (schema as { properties?: Record<string, unknown> } | null)?.properties
  const uncheckable = Object.entries(properties ?? {}).filter(([, value]) => value === "[redacted]").map(([name]) => name)
  for (const name of diagnosisOpaqueRequired(schema, fields)) {
    if (uncheckable.includes(name)) continue
    if (!Object.hasOwn(input, name) || input[name] === undefined) {
      findings.push({ property: name, rule: "required", valueKind: "absent" })
    }
  }
  for (const field of fields) {
    if (!Object.hasOwn(input, field.name) || input[field.name] === undefined) {
      if (field.required) findings.push({ property: field.name, rule: "required", valueKind: "absent" })
      continue
    }
    const value = input[field.name]
    // Receipt placeholders are not the original value and cannot establish a schema failure.
    if (/\[redacted\]|<fill in>|…/.test(JSON.stringify(value) ?? "")) {
      uncheckable.push(field.name)
      continue
    }
    const valueKind = webMcpValueKind(value)
    if (!typeOk(field, value)) {
      findings.push({ property: field.name, rule: "type", valueKind, expected: expectedType(field) })
      continue
    }
    for (const warning of toolInputWarnings([field], input)) {
      if (!RULES.has(warning.constraint as WebMcpDiagnosisRule) || warning.constraint === "type") continue
      findings.push({ property: field.name, rule: warning.constraint as WebMcpDiagnosisRule, valueKind })
    }
  }
  if (findings.length === 0 && fields.length === 0 && uncheckable.length === 0 && !emptyObjectSchema(schema)) {
    return { status: "unchecked", reason: "unsupported-schema" }
  }
  return { status: "checked", findings, ...(uncheckable.length ? { uncheckable } : {}) }
}

function emptyObjectSchema(schema: unknown): boolean {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return false
  const record = schema as { type?: unknown; properties?: unknown }
  return (
    record.type === "object" &&
    !!record.properties &&
    typeof record.properties === "object" &&
    !Array.isArray(record.properties) &&
    Object.keys(record.properties).length === 0
  )
}

/** True when two runs recorded different known definition digests. An unknown digest is not a difference. */
export function webMcpDefinitionsDiffer(left: string | null | undefined, right: string | null | undefined): boolean {
  return typeof left === "string" && left.length > 0 && typeof right === "string" && right.length > 0 && left !== right
}

/** True when a run's definition digest is known and is not the tool's current digest. */
export function webMcpDefinitionChanged(
  ranAgainst: string | null | undefined,
  current: string | null | undefined,
): boolean {
  return (
    typeof ranAgainst === "string" &&
    ranAgainst.length > 0 &&
    typeof current === "string" &&
    current.length > 0 &&
    ranAgainst !== current
  )
}

function shellSingleQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

/**
 * A regression snippet for one recorded call, plus the `pnpm run webmcp:check -- --run` argument for the same input.
 * The snippet calls the tool the way the builder guide does and asserts the recorded outcome.
 */
export function webMcpRegressionExport(entry: {
  tool: string
  input: Record<string, unknown>
  outcome: string
}): { snippet: string; runArgument: string } | null {
  // Admission, deadline and cancellation outcomes require adapter context that this snippet cannot reproduce.
  if (!["completed", "application-error"].includes(entry.outcome)) return null
  if (!entry.tool || entry.tool.length > 256 || /\[redacted(?: tool \d+)?\]/.test(entry.tool) || webMcpTextLooksSensitive(entry.tool)) return null
  if (!entry.input || typeof entry.input !== "object" || Array.isArray(entry.input)) return null
  let encoded: string
  try {
    // Secret-named fields become a placeholder: a copied test never carries the value that was typed.
    encoded = JSON.stringify(placeholderWebMcpSecrets(entry.input))
    if (!encoded || encoded === "null" || encoded[0] !== "{") return null
  } catch {
    return null
  }
  const name = JSON.stringify(entry.tool)
  const outcome = JSON.stringify(entry.outcome)
  const snippet = [
    `const tool = (await document.modelContext.getTools()).find((candidate) => candidate.name === ${name})`,
    'if (!tool) throw new Error("tool not registered")',
    "let result",
    "let rejected = false",
    `try { result = await document.modelContext.executeTool(tool, JSON.stringify(${encoded})) } catch { rejected = true }`,
    'if (typeof result === "string") { try { result = JSON.parse(result) } catch { /* Plain text is a normal output. */ } }',
    'if (result?.untrusted === true && result.result && typeof result.result === "object") result = result.result',
    'const status = typeof result?.status === "string" ? result.status.trim().toLowerCase() : ""',
    // Keep the generated standalone classifier aligned with webmcp-manual-outcome.js; parity tests execute it.
    'const applicationError = result && typeof result === "object" && (result.isError === true || result.ok === false ||',
    "  /^(error|failed|canceled|cancelled|timeout|aborted)$/.test(status) ||",
    '  (typeof result.error === "string" && result.error.trim().length > 0) ||',
    '  (result.error !== null && typeof result.error === "object" && !Array.isArray(result.error) && Object.keys(result.error).length > 0) ||',
    '  (typeof result.errorText === "string" && result.errorText.trim().length > 0))',
    'const outcome = rejected ? "application-error" : status === "timeout" ? "timeout" : /^(canceled|cancelled|aborted)$/.test(status) ? "cancelled" : applicationError ? "application-error" : "completed"',
    `if (outcome !== ${outcome}) throw new Error("expected outcome " + ${outcome})`,
  ].join("\n")
  return { snippet, runArgument: `--run ${shellSingleQuote(`${entry.tool}=${encoded}`)}` }
}

/** Resolve manual export names only from the exact native definition that owns the evidence. */
export function webMcpManualRegressionExport(entry: WebMcpJournalEntry, tool: WebMcpToolDefinition) {
  if (!webMcpEvidenceMatchesTool(entry, tool)) return null
  return webMcpRegressionExport({ tool: tool.name, input: entry.input, outcome: entry.outcome })
}
