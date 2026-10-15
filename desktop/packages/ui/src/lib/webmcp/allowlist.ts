import type { WebMcpApprovalRecord } from "@defai-digital/ax-code-sdk/v2"

export type WebMcpAllowlistScope = WebMcpApprovalRecord["scope"]
export type WebMcpAllowlistCapability = WebMcpAllowlistScope["capability"]

/** Display rank per capability: listing first, then navigation, read and close. */
export const WEBMCP_CAPABILITY_RANK: Record<WebMcpAllowlistCapability, number> = {
  list_pages: 0,
  navigate: 1,
  read: 2,
  close: 3,
}

export const WEBMCP_ORIGIN_CAPABILITIES: readonly WebMcpAllowlistCapability[] = ["navigate", "read", "close"]
export const WEBMCP_ALL_CAPABILITIES: readonly WebMcpAllowlistCapability[] = ["list_pages", "navigate", "read", "close"]

export const WEBMCP_LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]"])

const MAX_ORIGIN_LENGTH = 2048

/** https: anywhere, or http: on a loopback host. */
export function webMcpSchemeAllowed(url: URL): boolean {
  return url.protocol === "https:" || (url.protocol === "http:" && WEBMCP_LOOPBACK_HOSTS.has(url.hostname))
}

/**
 * The exact origin a typed value would grant, or undefined when the value
 * can never be granted. Ported from the AX Code bridge rule shared by the
 * TUI allowlist dialog: HTTPS anywhere, or HTTP on a loopback host, never
 * with credentials. The value is normalised to its origin, so a pasted page
 * URL offers grants for its site; wildcard patterns and over-long values
 * are rejected. The server validates again and stays authoritative.
 */
export function grantableOrigin(value: string): string | undefined {
  const trimmed = value.trim()
  if (trimmed === "" || trimmed.includes("*") || trimmed.length > MAX_ORIGIN_LENGTH) return undefined
  try {
    const url = new URL(trimmed)
    if (url.username || url.password) return undefined
    return webMcpSchemeAllowed(url) ? url.origin : undefined
  } catch {
    return undefined
  }
}

/** TUI-dialog alias: the origin a typed add-box value would grant. */
export const webMcpAllowlistOrigin = grantableOrigin

export function scopeOrigin(scope: WebMcpAllowlistScope): string {
  return scope.capability === "list_pages" ? "" : scope.origin
}

export function sameScope(a: WebMcpAllowlistScope, b: WebMcpAllowlistScope): boolean {
  if (a.capability === "list_pages" || b.capability === "list_pages") return a.capability === b.capability
  return a.capability === b.capability && a.origin === b.origin
}

/**
 * Saved records in a stable order: by origin (page listing, which has no
 * origin, first) and then by capability rank. Origins compare by code
 * point, not locale, so the order is the same on every machine.
 */
export function sortWebMcpApprovals(records: readonly WebMcpApprovalRecord[]): WebMcpApprovalRecord[] {
  return [...records].sort((a, b) => {
    const left = scopeOrigin(a.scope)
    const right = scopeOrigin(b.scope)
    if (left !== right) return left < right ? -1 : 1
    return WEBMCP_CAPABILITY_RANK[a.scope.capability] - WEBMCP_CAPABILITY_RANK[b.scope.capability]
  })
}

/** TUI-dialog alias for {@link sortWebMcpApprovals}. */
export const webMcpAllowlistRows = sortWebMcpApprovals

export type WebMcpScopeDescription = {
  capability: WebMcpAllowlistCapability
  /** Null for `list_pages`, which is not bound to a site. */
  origin: string | null
  /** i18n key for the capability label. */
  labelKey: string
  /** i18n key for the full one-line description of the scope. */
  titleKey: string
}

const CAPABILITY_LABEL_KEY: Record<WebMcpAllowlistCapability, string> = {
  list_pages: "webmcp.allowlist.capability.listPages",
  navigate: "webmcp.allowlist.capability.navigate",
  read: "webmcp.allowlist.capability.read",
  close: "webmcp.allowlist.capability.close",
}

/** Structured display description of a scope; callers localise via the keys. */
export function describeWebMcpScope(scope: WebMcpAllowlistScope): WebMcpScopeDescription {
  const origin = scope.capability === "list_pages" ? null : scope.origin
  return {
    capability: scope.capability,
    origin,
    labelKey: CAPABILITY_LABEL_KEY[scope.capability],
    titleKey: scope.capability === "list_pages" ? "webmcp.allowlist.scope.listPages" : "webmcp.allowlist.scope.origin",
  }
}

/** TUI-parity plain title, used where a localised label is not available. */
export function webMcpAllowlistScopeTitle(scope: WebMcpAllowlistScope): string {
  if (scope.capability === "list_pages") return "List all browser pages"
  return `${scope.capability}: ${scope.origin}`
}

/**
 * Grant scopes offered for a typed origin and the capabilities the user
 * picked: one scope per origin capability (navigate/read/close) bound to
 * the normalised origin, plus `list_pages` which has no origin. Scopes that
 * are already saved are never offered twice, and origin capabilities are
 * only offered when the typed value is a grantable origin.
 */
export function buildGrantScopes(input: {
  originInput: string
  capabilities: readonly WebMcpAllowlistCapability[]
  existing?: readonly WebMcpApprovalRecord[]
}): WebMcpAllowlistScope[] {
  const saved = (input.existing ?? []).map((record) => record.scope)
  const wanted = new Set(input.capabilities)
  const scopes: WebMcpAllowlistScope[] = []
  const push = (scope: WebMcpAllowlistScope) => {
    if (!saved.some((existing) => sameScope(existing, scope))) scopes.push(scope)
  }
  if (wanted.has("list_pages")) push({ capability: "list_pages" })
  const origin = grantableOrigin(input.originInput)
  if (origin) {
    for (const capability of WEBMCP_ORIGIN_CAPABILITIES) {
      if (wanted.has(capability)) push({ capability, origin } as WebMcpAllowlistScope)
    }
  }
  return scopes.sort((a, b) => WEBMCP_CAPABILITY_RANK[a.capability] - WEBMCP_CAPABILITY_RANK[b.capability])
}

/**
 * Every grant row a typed value could offer before capability filtering:
 * `list_pages` plus one row per origin capability when the value is a
 * grantable origin.
 */
export function grantRowsForOrigin(
  originInput: string,
  existing?: readonly WebMcpApprovalRecord[],
): WebMcpAllowlistScope[] {
  return buildGrantScopes({ originInput, capabilities: WEBMCP_ALL_CAPABILITIES, existing })
}

export type WebMcpAllowlistErrorReason = "not_connected" | "not_webmcp" | "rejected" | "other"

function reasonFromValue(value: unknown, depth: number): WebMcpAllowlistErrorReason | undefined {
  if (depth > 4 || value === null || value === undefined) return undefined
  if (typeof value === "string") {
    const text = value.toLowerCase()
    if (text.includes("not_connected")) return "not_connected"
    if (text.includes("not_webmcp")) return "not_webmcp"
    if (text.includes("rejected")) return "rejected"
    return undefined
  }
  if (typeof value !== "object") return undefined
  const record = value as Record<string, unknown>
  for (const key of ["reason", "code", "name"]) {
    const found = reasonFromValue(record[key], depth + 1)
    if (found) return found
  }
  for (const key of ["details", "data", "error", "cause"]) {
    const found = reasonFromValue(record[key], depth + 1)
    if (found) return found
  }
  return reasonFromValue(record.message, depth + 1)
}

/** Classify a runtime API failure into the allowlist error reason. */
export function webMcpAllowlistErrorReason(error: unknown): WebMcpAllowlistErrorReason {
  const reason = reasonFromValue(error, 0)
  if (reason) return reason
  if (error !== null && typeof error === "object") {
    const status = (error as Record<string, unknown>).status
    if (status === 404) return "not_webmcp"
  }
  if (error instanceof Error) {
    try {
      return webMcpAllowlistErrorReason(JSON.parse(error.message) as unknown)
    } catch {
      return "other"
    }
  }
  return "other"
}

const ERROR_MESSAGE_KEY: Record<WebMcpAllowlistErrorReason, string> = {
  not_connected: "webmcp.allowlist.error.notConnected",
  not_webmcp: "webmcp.allowlist.error.notWebMcp",
  rejected: "webmcp.allowlist.error.rejected",
  other: "webmcp.allowlist.error.generic",
}

/** Map a runtime API failure to the i18n message key that describes it. */
export function webMcpAllowlistErrorKey(error: unknown): string {
  return ERROR_MESSAGE_KEY[webMcpAllowlistErrorReason(error)]
}
