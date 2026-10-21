import { create } from "zustand"
import { normalizeProjectPath } from "@/lib/projectResolution"
import {
  diffWebMcpRegistration,
  markWebMcpRunsStale,
  readWebMcpCatalog,
  WEBMCP_DRAFT_LIMIT,
  WEBMCP_RUN_LIMIT,
  type WebMcpCatalogLimit,
  type WebMcpCatalogRejection,
  type WebMcpRegistrationEvent,
  type WebMcpToolDefinition,
  type WebMcpToolDraft,
  type WebMcpToolRun,
} from "@/lib/webMcpCatalog"

export type {
  WebMcpCatalogLimit,
  WebMcpCatalogRejection,
  WebMcpCatalogRejectionReason,
  WebMcpRegistrationEvent,
  WebMcpToolAnnotations,
  WebMcpToolDefinition,
  WebMcpToolDraft,
  WebMcpToolKind,
  WebMcpToolRun,
} from "@/lib/webMcpCatalog"
export { readWebMcpCatalog } from "@/lib/webMcpCatalog"

/**
 * Shared projection of the native WebMCP project browser.
 *
 * The browser itself is owned by the Electron main process and driven by the
 * context panel's agent browser pane. Every other surface (Services → MCP,
 * Settings → MCP) only reads this projection and asks the pane to take over
 * through `requestAgentMode`. Agent access can only be switched inside the
 * pane, so this store never exposes an enable/disable action.
 */
export type WebMcpBrowserPhase = "idle" | "starting" | "ready" | "error"

/** What the pane shows while `origin` is null: nothing yet, or a page the agent cannot be granted. */
export type WebMcpPageKind = "blank" | "unsupported" | "ready"

export type WebMcpBrowserErrorCode =
  | "ERR_UNSAFE_PORT"
  | "ERR_NAME_NOT_RESOLVED"
  | "ERR_CONNECTION_REFUSED"
  | "ERR_CONNECTION_TIMED_OUT"
  | "ERR_INTERNET_DISCONNECTED"
  | "ERR_CERT_AUTHORITY_INVALID"
  | "ERR_CERT_DATE_INVALID"
  | "ERR_ABORTED"
  | "ERR_INVALID_URL"
  | "session-required"
  | "start-failed"
  | "disconnected"
  | "runtime-incompatible"
  | "enable-failed"
  | "operation-failed"

export interface WebMcpBrowserSnapshot {
  phase: WebMcpBrowserPhase
  browserId: string | null
  directory: string | null
  sessionID: string | null
  nativeAvailable: boolean
  /** null until the runtime capability probe has answered. */
  runtimeCompatible: boolean | null
  paused: boolean
  enabled: boolean
  origin: string | null
  /** null until the browser reports its first status. */
  page: WebMcpPageKind | null
  tools: number
  /** The page's tools with their descriptions and input schemas, visible before the agent is granted anything. */
  catalog: WebMcpToolDefinition[]
  /** How many tools the page registered, and whether the panel stopped at 64 tools or 256 KiB. */
  catalogLimit: WebMcpCatalogLimit
  /** Named reason the latest registration was refused. Null when the catalog was accepted. */
  catalogRejection: WebMcpCatalogRejection | null
  busy: boolean
  error: WebMcpBrowserErrorCode | null
  /** Chrome-bridge MCP servers paused while this browser is enrolled (see lib/webMcpBridgeCoordination). */
  pausedBridgeServers: string[]
}

interface WebMcpBrowserState extends WebMcpBrowserSnapshot {
  /** Monotonic counter: each increment asks the browser pane to switch to agent mode. */
  agentModeRequests: number
  agentModeConsumed: number
  /** Monotonic counter: the user explicitly asked for agent access to be enabled once the browser is ready. */
  enableRequests: number
  enableConsumed: number
  /** Settings → MCP shows the browser-tools card instead of a server page. */
  settingsCardSelected: boolean
  /** Latest registration changes for the current page. In memory only, capped. */
  registration: readonly WebMcpRegistrationEvent[]
  /** Form drafts keyed by tool name. Kept across a same-definition reload; not written to disk. */
  toolDrafts: Record<string, WebMcpToolDraft>
  /** Manual results keyed by tool name. A changed definition is marked stale. */
  toolRuns: Record<string, WebMcpToolRun>
  updateSnapshot: (partial: WebMcpSnapshotUpdate) => void
  saveToolDraft: (name: string, draft: WebMcpToolDraft) => void
  recordToolRun: (name: string, run: WebMcpToolRun) => void
  clearToolRun: (name: string) => void
  resetSnapshot: () => void
  requestAgentMode: (options?: { enable?: boolean }) => void
  consumeAgentModeRequest: () => boolean
  consumeEnableRequest: () => boolean
  setSettingsCardSelected: (selected: boolean) => void
}

/** Catalog and rejection arrive untrusted from the page. `updateSnapshot` normalizes them. */
type WebMcpSnapshotUpdate = Omit<Partial<WebMcpBrowserSnapshot>, "catalog" | "catalogRejection"> & {
  catalog?: unknown
  catalogRejection?: unknown
}

const initialSnapshot: WebMcpBrowserSnapshot = {
  phase: "idle",
  browserId: null,
  directory: null,
  sessionID: null,
  nativeAvailable: false,
  runtimeCompatible: null,
  paused: false,
  enabled: false,
  origin: null,
  page: null,
  tools: 0,
  catalog: [],
  catalogLimit: { total: 0, shown: 0, truncation: null },
  catalogRejection: null,
  busy: false,
  error: null,
  pausedBridgeServers: [],
}

export const useWebMcpBrowserStore = create<WebMcpBrowserState>()((set, get) => ({
  ...initialSnapshot,
  agentModeRequests: 0,
  agentModeConsumed: 0,
  enableRequests: 0,
  enableConsumed: 0,
  settingsCardSelected: false,
  registration: [],
  toolDrafts: {},
  toolRuns: {},
  updateSnapshot: (partial) =>
    set((state) => {
      // Raw catalog bytes are normalized below. They must not land on the snapshot first.
      const { catalog, catalogRejection, ...rest } = partial
      void catalog
      void catalogRejection
      return {
        ...rest,
        ...observeCatalog(state, partial),
      }
    }),
  saveToolDraft: (name, draft) =>
    set((state) => {
      if (!name || name.length > 256 || draft.digest.length > 64) return {}
      const next = { ...state.toolDrafts }
      delete next[name]
      next[name] = {
        digest: draft.digest,
        values: boundRecord(draft.values),
        sendEmpty: boundFlags(draft.sendEmpty),
        json: draft.json.slice(0, 65536),
        jsonMode: draft.jsonMode === true,
      }
      const names = Object.keys(next)
      while (names.length > WEBMCP_DRAFT_LIMIT) {
        const oldest = names.shift()
        if (oldest) delete next[oldest]
      }
      return { toolDrafts: next }
    }),
  recordToolRun: (name, run) =>
    set((state) => {
      if (!name || name.length > 256 || run.digest.length > 64) return {}
      const next = { ...state.toolRuns }
      delete next[name]
      next[name] = {
        digest: run.digest,
        outcome: run.outcome.slice(0, 64),
        text: run.text.slice(0, 4000),
        stale: run.stale === true,
      }
      const names = Object.keys(next)
      while (names.length > WEBMCP_RUN_LIMIT) {
        const oldest = names.shift()
        if (oldest) delete next[oldest]
      }
      return { toolRuns: next }
    }),
  clearToolRun: (name) =>
    set((state) => {
      if (!Object.hasOwn(state.toolRuns, name)) return {}
      const next = { ...state.toolRuns }
      delete next[name]
      return { toolRuns: next }
    }),
  resetSnapshot: () =>
    set((state) => ({
      ...initialSnapshot,
      registration: [],
      toolDrafts: {},
      toolRuns: {},
      // The runtime compatibility answer does not depend on a live browser.
      runtimeCompatible: state.runtimeCompatible,
    })),
  requestAgentMode: (options) =>
    set((state) => ({
      agentModeRequests: state.agentModeRequests + 1,
      enableRequests: options?.enable ? state.enableRequests + 1 : state.enableRequests,
    })),
  consumeAgentModeRequest: () => {
    const { agentModeRequests, agentModeConsumed } = get()
    if (agentModeRequests <= agentModeConsumed) return false
    set({ agentModeConsumed: agentModeRequests })
    return true
  },
  consumeEnableRequest: () => {
    const { enableRequests, enableConsumed } = get()
    if (enableRequests <= enableConsumed) return false
    set({ enableConsumed: enableRequests })
    return true
  },
  setSettingsCardSelected: (selected) => set({ settingsCardSelected: selected }),
}))

// Persist only a bounded address history. Access, grants, page references and storage
// remain ephemeral. Query strings, fragments and user info are never stored.
export const WEBMCP_HISTORY_KEY = "ax-code.webmcp-addresses.v1"
const MAX_ADDRESSES = 64
const MAX_HISTORY_BYTES = 200_000

type AddressEntry = { directory: string; sessionID: string; url: string }

export function safeWebMcpAddress(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null
  try {
    const url = new URL(value)
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null
    url.search = ""
    url.hash = ""
    return url.href
  } catch {
    return null
  }
}

function addressIdentity(directory: string, sessionID: string | null) {
  const normalized = normalizeProjectPath(directory)
  if (
    !normalized ||
    normalized.length > 2048 ||
    normalized.includes("\0") ||
    !/^(?:\/|[A-Z]:\/)/.test(normalized) ||
    !sessionID ||
    !/^ses_[A-Za-z0-9_-]{1,200}$/.test(sessionID)
  )
    return null
  return { directory: normalized, sessionID }
}

function readAddresses(): AddressEntry[] {
  try {
    const raw = localStorage.getItem(WEBMCP_HISTORY_KEY)
    if (!raw || raw.length > MAX_HISTORY_BYTES) return []
    const data: unknown = JSON.parse(raw)
    if (!Array.isArray(data) || data.length > MAX_ADDRESSES) return []
    return data.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return []
      const identity = addressIdentity(entry.directory, entry.sessionID)
      const url = safeWebMcpAddress(entry.url)
      return identity && url ? [{ ...identity, url }] : []
    })
  } catch {
    return []
  }
}

export function restoreWebMcpAddress(directory: string, sessionID: string | null): string | null {
  const identity = addressIdentity(directory, sessionID)
  if (!identity) return null
  return (
    readAddresses().find((entry) => entry.directory === identity.directory && entry.sessionID === sessionID)?.url ??
    null
  )
}

export function rememberWebMcpAddress(directory: string, sessionID: string | null, value: unknown): void {
  const identity = addressIdentity(directory, sessionID)
  const url = safeWebMcpAddress(value)
  if (!identity || !url) return
  const addresses = readAddresses().filter(
    (entry) => entry.directory !== identity.directory || entry.sessionID !== sessionID,
  )
  try {
    const bounded = [{ ...identity, url }, ...addresses].slice(0, MAX_ADDRESSES)
    while (JSON.stringify(bounded).length > MAX_HISTORY_BYTES) bounded.pop()
    localStorage.setItem(WEBMCP_HISTORY_KEY, JSON.stringify(bounded))
  } catch {
    // Storage can be disabled or full; browsing stays available without persistence.
  }
}

const boundRecord = (value: Record<string, string>) => {
  const next: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value).slice(0, 128)) {
    if (typeof key !== "string" || typeof entry !== "string" || key.length > 256) continue
    next[key] = entry.slice(0, 65536)
  }
  return next
}

const boundFlags = (value: Record<string, boolean>) => {
  const next: Record<string, boolean> = {}
  for (const [key, entry] of Object.entries(value).slice(0, 128)) {
    if (typeof key !== "string" || key.length > 256) continue
    next[key] = entry === true
  }
  return next
}

/**
 * Page identity for drafts, results and the registration timeline. An origin change drops them.
 * Catalog updates diff the definitions already on the page. Nothing here is written to disk.
 */
function observeCatalog(
  state: {
    origin: string | null
    catalog: readonly WebMcpToolDefinition[]
    registration: readonly WebMcpRegistrationEvent[]
    toolDrafts: Record<string, WebMcpToolDraft>
    toolRuns: Record<string, WebMcpToolRun>
  },
  partial: WebMcpSnapshotUpdate,
): Partial<WebMcpBrowserSnapshot> & Partial<Pick<WebMcpBrowserState, "registration" | "toolDrafts" | "toolRuns">> {
  const originChanged = partial.origin !== undefined && partial.origin !== state.origin
  if (!("catalog" in partial) && !originChanged && !("catalogRejection" in partial) && !("catalogLimit" in partial)) {
    return {}
  }
  const next: Partial<WebMcpBrowserSnapshot> &
    Partial<Pick<WebMcpBrowserState, "registration" | "toolDrafts" | "toolRuns">> = {}
  // Keep the same array when the catalog is unchanged so a status poll does not rebuild the timeline.
  let registration = originChanged ? [] : state.registration
  const toolDrafts = originChanged ? {} : state.toolDrafts
  let toolRuns = originChanged ? {} : state.toolRuns
  const previous = originChanged ? [] : state.catalog
  if ("catalog" in partial || "catalogLimit" in partial || "catalogRejection" in partial) {
    const read = readWebMcpCatalog("catalog" in partial ? partial.catalog : previous, {
      total: partial.catalogLimit?.total,
      truncation: partial.catalogLimit?.truncation,
      rejection: "catalogRejection" in partial ? partial.catalogRejection : undefined,
    })
    if ("catalog" in partial) {
      next.catalog = read.catalog
      registration = diffWebMcpRegistration(previous, read.catalog, registration)
      toolRuns = markWebMcpRunsStale(toolRuns, read.catalog)
    }
    if ("catalog" in partial || "catalogLimit" in partial) next.catalogLimit = read.catalogLimit
    if ("catalogRejection" in partial) next.catalogRejection = read.catalogRejection
  }
  if (originChanged || "catalog" in partial) {
    next.registration = registration
    next.toolDrafts = toolDrafts
    next.toolRuns = toolRuns
  }
  return next
}
