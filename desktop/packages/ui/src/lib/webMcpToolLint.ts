import type { WebMcpToolDefinition } from "@/lib/webMcpCatalog"

/**
 * Authoring advice for a page-tool builder. Findings never reject a call, a catalog, or a form:
 * the AX Code runtime remains the authority for the schema profile (WX-16).
 */
export const WEBMCP_LINT_NAME_MAX = 64
export const WEBMCP_LINT_DESCRIPTION_MAX = 500
/** Keywords the next AX Code runtime contract rejects. A page-supplied regular expression can stall an agent. */
export const WEBMCP_REJECTED_SCHEMA_KEYWORDS = ["pattern", "patternProperties"] as const

export type WebMcpRejectedSchemaKeyword = (typeof WEBMCP_REJECTED_SCHEMA_KEYWORDS)[number]

export type WebMcpLintCode =
  | "name-length"
  | "description-length"
  | "missing-description"
  | "missing-property-description"
  | "opaque-value"
  | "rejected-keyword"

export interface WebMcpLintFinding {
  code: WebMcpLintCode
  keyword?: WebMcpRejectedSchemaKeyword
  length?: number
  names?: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

const OPAQUE_VALUE = /^(?:[0-9]+|[0-9a-f]{16,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i

const opaqueText = (value: unknown): string | null => {
  if (typeof value === "number" || typeof value === "boolean") return JSON.stringify(value)
  if (typeof value !== "string") return value === undefined ? null : "[value]"
  if (OPAQUE_VALUE.test(value) || (value.length > 48 && !/\s/.test(value))) return value.slice(0, 48)
  return null
}

const collectOpaque = (property: Record<string, unknown>, name: string, sink: string[]) => {
  if (sink.length >= 8) return
  if (Array.isArray(property.enum)) {
    for (const option of property.enum) {
      if (sink.length >= 8) return
      const text = opaqueText(option)
      if (text !== null) sink.push(`${name}=${text}`)
    }
  }
  if (Object.hasOwn(property, "const") && sink.length < 8) {
    const text = opaqueText(property.const)
    if (text !== null) sink.push(`${name}=${text}`)
  }
}

const SCHEMA_MAP_KEYS = ["$defs", "definitions", "patternProperties"] as const
const SCHEMA_NODE_KEYS = [
  "items",
  "additionalProperties",
  "unevaluatedItems",
  "unevaluatedProperties",
  "contains",
  "not",
  "if",
  "then",
  "else",
  "propertyNames",
] as const
const SCHEMA_LIST_KEYS = ["allOf", "anyOf", "oneOf", "prefixItems"] as const

interface LintWalk {
  nodes: number
  keywords: Set<WebMcpRejectedSchemaKeyword>
  missing: string[]
  opaque: string[]
}

const walkSchema = (node: unknown, state: LintWalk) => {
  if (!isRecord(node) || state.nodes >= 200) return
  state.nodes += 1
  for (const keyword of WEBMCP_REJECTED_SCHEMA_KEYWORDS) {
    if (Object.hasOwn(node, keyword)) state.keywords.add(keyword)
  }
  if (isRecord(node.properties)) {
    for (const [name, property] of Object.entries(node.properties).slice(0, 128)) {
      if (!isRecord(property)) continue
      if (state.missing.length < 8 && (typeof property.description !== "string" || !property.description.trim())) {
        state.missing.push(name)
      }
      collectOpaque(property, name, state.opaque)
      walkSchema(property, state)
    }
  }
  for (const key of SCHEMA_MAP_KEYS) {
    if (!isRecord(node[key])) continue
    for (const property of Object.values(node[key]).slice(0, 64)) walkSchema(property, state)
  }
  for (const key of SCHEMA_NODE_KEYS) if (node[key] !== undefined) walkSchema(node[key], state)
  for (const key of SCHEMA_LIST_KEYS) {
    if (!Array.isArray(node[key])) continue
    for (const item of node[key].slice(0, 32)) walkSchema(item, state)
  }
}

const bounded = (values: string[]) => values.join(", ").slice(0, 200)

/** Advice only. Callers must still run the tool when the person asks. */
export function lintWebMcpTool(
  tool: Pick<WebMcpToolDefinition, "name" | "description" | "inputSchema">,
): WebMcpLintFinding[] {
  const findings: WebMcpLintFinding[] = []
  if (tool.name.length > WEBMCP_LINT_NAME_MAX) {
    findings.push({ code: "name-length", length: tool.name.length })
  }
  const description = tool.description.trim()
  if (!description) findings.push({ code: "missing-description" })
  else if (description.length > WEBMCP_LINT_DESCRIPTION_MAX) {
    findings.push({ code: "description-length", length: description.length })
  }
  const state: LintWalk = { nodes: 0, keywords: new Set(), missing: [], opaque: [] }
  try {
    walkSchema(tool.inputSchema, state)
  } catch {
    // A hostile schema yields whatever advice was collected before the walk stopped.
  }
  if (state.missing.length) findings.push({ code: "missing-property-description", names: bounded(state.missing) })
  if (state.opaque.length) findings.push({ code: "opaque-value", names: bounded(state.opaque) })
  for (const keyword of WEBMCP_REJECTED_SCHEMA_KEYWORDS) {
    if (state.keywords.has(keyword)) findings.push({ code: "rejected-keyword", keyword })
  }
  return findings
}
