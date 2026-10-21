import { redactWebMcpText } from "../../../../shared/webmcp-redaction.mjs"
/** Bounds and projection for the page-tool catalog the builder inspects. In memory only. */

export const WEBMCP_CATALOG_TOOL_CAP = 64
export const WEBMCP_CATALOG_BYTE_CAP = 262144
export const WEBMCP_REGISTRATION_LIMIT = 32
export const WEBMCP_DRAFT_LIMIT = 64
export const WEBMCP_RUN_LIMIT = 64
/** Manual Try it runs kept per page view. In memory only. */
export const WEBMCP_JOURNAL_LIMIT = 32

export type WebMcpToolKind = "form" | "script"

export interface WebMcpToolAnnotations {
  readOnlyHint?: boolean
  untrustedContentHint?: boolean
  consequentialHint?: boolean
}

export interface WebMcpToolDefinition {
  name: string
  description: string
  inputSchema?: unknown
  /** Exact schema for manual input construction and validation, never a display document. */
  executionSchema?: unknown
  annotations?: WebMcpToolAnnotations
  kind?: WebMcpToolKind
  /** Frame-independent catalog identity for drafts and registration changes. */
  digest?: string
  /** Native invocation identity, including the frame. Never synthesized in the renderer. */
  definitionDigest?: string
  invocationID?: string
}

export type WebMcpCatalogTruncation = "count" | "bytes"

export interface WebMcpCatalogLimit {
  total: number
  shown: number
  truncation: WebMcpCatalogTruncation | null
}

export const WEBMCP_CATALOG_REJECTION_REASONS = [
  "duplicate-name",
  "invalid-schema",
  "invalid-name",
  "invalid-description",
  "definition-too-large",
  "catalog-too-large",
] as const

export type WebMcpCatalogRejectionReason = (typeof WEBMCP_CATALOG_REJECTION_REASONS)[number]

export interface WebMcpCatalogRejection {
  code: "invalid-catalog"
  reason: WebMcpCatalogRejectionReason
  tool: string
}

export interface WebMcpRegistrationEvent {
  invocationID: string
  kind: "added" | "removed" | "changed"
  name: string
  digest: string
  definition?: WebMcpToolDefinition
  previousDefinition?: WebMcpToolDefinition
  previousDigest?: string
}

export interface WebMcpToolDraft {
  digest: string
  values: Record<string, string>
  sendEmpty: Record<string, boolean>
  json: string
  jsonMode: boolean
}

export interface WebMcpToolRun {
  digest: string
  outcome: string
  text: string
  stale: boolean
}

/** One Try it run, with the catalog and native invocation identities captured at dispatch. */
export interface WebMcpJournalEntry {
  id: string
  /** Display label only. Manual evidence is bound by invocationID and definitionDigest. */
  tool: string
  invocationID?: string
  input: Record<string, unknown>
  outcome: string
  text: string
  durationMs: number
  digest: string
  /** Full native definition identity, including the frame, for comparison with runtime receipts. */
  definitionDigest?: string
  definitionChanged?: boolean
  at: number
}

/** Missing native identities never match, even when display labels or catalog digests coincide. */
export function webMcpToolIdentity(tool: { invocationID?: string; definitionDigest?: string }): string | null {
  return tool.invocationID && tool.definitionDigest ? `${tool.invocationID}:${tool.definitionDigest}` : null
}

export function webMcpEvidenceMatchesTool(
  evidence: { invocationID?: string; definitionDigest?: string },
  tool: WebMcpToolDefinition,
): boolean {
  const identity = webMcpToolIdentity(tool)
  return identity !== null && webMcpToolIdentity(evidence) === identity
}

let journalSerial = 0

export function createWebMcpJournalId(now = Date.now()): string {
  journalSerial = (journalSerial + 1) % 46656
  return `j${now.toString(36)}${journalSerial.toString(36)}`
}

export interface WebMcpCatalogReadMeta {
  total?: unknown
  truncation?: unknown
  rejection?: unknown
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

const canonicalJson = (value: unknown, depth = 0): string => {
  if (depth > 32) throw new Error("WebMCP JSON nesting limit exceeded")
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item, depth + 1)).join(",")}]`
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key], depth + 1)}`)
      .join(",")}}`
  }
  return JSON.stringify(value) ?? "null"
}

/** Stable definition identity for drafts, stale results and the registration timeline. */
export function webMcpDefinitionDigest(tool: {
  name: string
  description: string
  inputSchema?: unknown
  annotations?: WebMcpToolAnnotations
}): string {
  const identity: Record<string, unknown> = { name: tool.name, description: tool.description }
  if (tool.inputSchema !== undefined) identity.inputSchema = tool.inputSchema
  if (tool.annotations !== undefined) identity.annotations = tool.annotations
  let canonical = `${tool.name}\0${tool.description.length}`
  try {
    canonical = canonicalJson(identity)
  } catch {
    // Unhashable schemas still need a distinct identity so a later edit can mark results stale.
  }
  let hash = 0x811c9dc5
  for (let index = 0; index < canonical.length; index++) {
    hash ^= canonical.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

const providedDigest = (value: unknown): string | undefined =>
  typeof value === "string" && /^[a-f0-9]{8,64}$/.test(value) ? value : undefined

export function readWebMcpAnnotations(value: unknown): WebMcpToolAnnotations | undefined {
  if (!isRecord(value)) return undefined
  const annotations: WebMcpToolAnnotations = {
    readOnlyHint: value.readOnlyHint === true || value.readOnly === true,
    untrustedContentHint: value.untrustedContentHint === true || value.untrustedContent === true,
    consequentialHint: value.consequentialHint === true || value.consequential === true,
  }
  if (!annotations.readOnlyHint && !annotations.untrustedContentHint && !annotations.consequentialHint) return undefined
  return annotations
}

const readKind = (value: unknown): WebMcpToolKind => (value === "form" ? "form" : "script")

const byteSize = (value: unknown): number => {
  try {
    return new TextEncoder().encode(JSON.stringify(value) ?? "").byteLength
  } catch {
    return WEBMCP_CATALOG_BYTE_CAP + 1
  }
}

const readTool = (entry: unknown): WebMcpToolDefinition | null => {
  if (!isRecord(entry)) return null
  const { name, description, inputSchema } = entry
  // Reject oversized definitions instead of cutting a credential before the display redactor sees it.
  if (
    typeof name !== "string" || !name || name.length > 256 ||
    typeof description !== "string" || description.length > 4096
  ) return null
  const tool: WebMcpToolDefinition = {
    name,
    description,
    kind: readKind(entry.kind),
  }
  if (inputSchema !== undefined) tool.inputSchema = inputSchema
  if (entry.executionSchema !== undefined) tool.executionSchema = entry.executionSchema
  const annotations = readWebMcpAnnotations(entry.annotations)
  if (annotations) tool.annotations = annotations
  tool.digest = providedDigest(entry.digest) ?? webMcpDefinitionDigest(tool)
  const nativeDigest = providedDigest(entry.definitionDigest)
  if (nativeDigest) tool.definitionDigest = nativeDigest
  if (providedDigest(entry.invocationID)) tool.invocationID = entry.invocationID as string
  return tool
}

export function readWebMcpRejection(value: unknown): WebMcpCatalogRejection | null {
  if (!isRecord(value) || value.code !== "invalid-catalog" || typeof value.reason !== "string") return null
  if (!WEBMCP_CATALOG_REJECTION_REASONS.includes(value.reason as WebMcpCatalogRejectionReason)) return null
  return {
    code: "invalid-catalog",
    reason: value.reason as WebMcpCatalogRejectionReason,
    tool: typeof value.tool === "string" ? redactWebMcpText(value.tool).slice(0, 64) : "",
  }
}

/**
 * Keeps a bounded, display-safe catalog. `total` and `truncation` from the browser are trusted only
 * as numbers and the two known reasons; everything else is dropped.
 */
export function readWebMcpCatalog(
  value: unknown,
  meta: WebMcpCatalogReadMeta = {},
): {
  catalog: WebMcpToolDefinition[]
  catalogLimit: WebMcpCatalogLimit
  catalogRejection: WebMcpCatalogRejection | null
} {
  const source = Array.isArray(value) ? value : []
  const catalog: WebMcpToolDefinition[] = []
  let bytes = 0
  let truncation: WebMcpCatalogTruncation | null = null
  for (const entry of source) {
    if (catalog.length >= WEBMCP_CATALOG_TOOL_CAP) {
      truncation = "count"
      break
    }
    const tool = readTool(entry)
    if (!tool) continue
    const size = byteSize(tool)
    if (bytes + size > WEBMCP_CATALOG_BYTE_CAP) {
      truncation = "bytes"
      break
    }
    bytes += size
    catalog.push(tool)
  }
  const reportedTotal =
    typeof meta.total === "number" && Number.isFinite(meta.total) && meta.total >= 0
      ? Math.min(Math.floor(meta.total), 100_000)
      : source.length
  const total = Math.max(reportedTotal, catalog.length)
  if (!truncation && (meta.truncation === "count" || meta.truncation === "bytes")) truncation = meta.truncation
  if (!truncation && source.length > catalog.length && catalog.length >= WEBMCP_CATALOG_TOOL_CAP) truncation = "count"
  return {
    catalog,
    catalogLimit: { total, shown: catalog.length, truncation },
    catalogRejection: readWebMcpRejection(meta.rejection),
  }
}

/** Main-issued bindings, including retained versions, for runtime digest resolution. */
export function webMcpKnownDefinitions(view: {
  catalog: readonly WebMcpToolDefinition[]
  registration: readonly WebMcpRegistrationEvent[]
} | null | undefined): WebMcpToolDefinition[] {
  return view ? [...view.catalog, ...view.registration.flatMap((event) =>
    [event.definition, event.previousDefinition].filter((tool): tool is WebMcpToolDefinition => Boolean(tool)))] : []
}

/** A native digest contains the real name. Resolve only main-issued, unambiguous bindings. */
export function webMcpDefinitionForDigest(
  definitions: readonly WebMcpToolDefinition[],
  digest: string | null | undefined,
): WebMcpToolDefinition | null {
  if (!digest) return null
  const matches = definitions.filter((tool) => tool.definitionDigest === digest && webMcpToolIdentity(tool))
  return matches.length && matches.every((tool) => tool.invocationID === matches[0].invocationID) ? matches[0] : null
}

/** Registration continuity uses the opaque tool ID; each event retains both exact definition versions. */
export function diffWebMcpRegistration(
  previous: readonly WebMcpToolDefinition[],
  next: readonly WebMcpToolDefinition[],
  events: readonly WebMcpRegistrationEvent[],
): readonly WebMcpRegistrationEvent[] {
  const byID = (tools: readonly WebMcpToolDefinition[]) =>
    new Map(tools.filter((tool) => webMcpToolIdentity(tool)).map((tool) => [tool.invocationID!, tool]))
  const prev = byID(previous)
  const nxt = byID(next)
  let timeline = events
  const push = (event: WebMcpRegistrationEvent) => {
    if (event.kind === "added") {
      const index = timeline.findLastIndex((prior) => prior.invocationID === event.invocationID)
      const prior = timeline[index]
      if (prior?.kind === "removed") {
        if (webMcpEvidenceMatchesTool(prior.previousDefinition ?? {}, event.definition!)) {
          timeline = timeline.filter((_, item) => item !== index)
        } else {
          timeline = timeline.map((item, i) => i === index ? {
            ...event, kind: "changed", previousDigest: prior.digest,
            previousDefinition: prior.previousDefinition,
          } : item)
        }
        return
      }
    }
    timeline = [...timeline, event].slice(-WEBMCP_REGISTRATION_LIMIT)
  }
  for (const [invocationID, before] of prev) {
    const after = nxt.get(invocationID)
    if (!after || !webMcpEvidenceMatchesTool(before, after)) push({
      invocationID, kind: after ? "changed" : "removed", name: (after ?? before).name,
      digest: (after ?? before).digest ?? "",
      ...(after ? { previousDigest: before.digest } : {}),
      definition: after, previousDefinition: before,
    })
  }
  for (const [invocationID, after] of nxt) if (!prev.has(invocationID)) push({
    invocationID, kind: "added", name: after.name, digest: after.digest ?? "",
    definition: after, previousDefinition: undefined,
  })
  return timeline
}

export function markWebMcpRunsStale<T extends { digest: string; stale: boolean }>(
  runs: Record<string, T>,
  catalog: readonly WebMcpToolDefinition[],
): Record<string, T> {
  const byIdentity = new Map(catalog.map((tool) => [webMcpToolIdentity(tool), tool.digest ?? ""]))
  let changed = false
  const next: Record<string, T> = { ...runs }
  for (const [identity, run] of Object.entries(runs)) {
    // A removed or replaced native identity cannot provide current manual evidence.
    const stale = byIdentity.get(identity) !== run.digest
    if (stale !== run.stale) {
      next[identity] = { ...run, stale }
      changed = true
    }
  }
  return changed ? next : runs
}
