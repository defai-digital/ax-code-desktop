import { create } from "zustand"
import { normalizeProjectPath } from "@/lib/projectResolution"

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

/** A tool the current page registers, as the browser reports it (already bounded in Electron main). */
export interface WebMcpToolDefinition {
  name: string
  description: string
  inputSchema?: unknown
}

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
  /** The page document's generation; a new load gets a new one. Calls record the generation they ran on. */
  generation: string | null
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
  updateSnapshot: (partial: Partial<WebMcpBrowserSnapshot>) => void
  resetSnapshot: () => void
  requestAgentMode: (options?: { enable?: boolean }) => void
  consumeAgentModeRequest: () => boolean
  consumeEnableRequest: () => boolean
  setSettingsCardSelected: (selected: boolean) => void
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
  generation: null,
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
  updateSnapshot: (partial) => set(partial),
  resetSnapshot: () =>
    set((state) => ({
      ...initialSnapshot,
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

/** Keeps only well-formed catalog entries; anything else the browser sends is dropped, not trusted. */
export function readWebMcpCatalog(value: unknown): WebMcpToolDefinition[] {
  if (!Array.isArray(value)) return []
  const catalog: WebMcpToolDefinition[] = []
  for (const entry of value.slice(0, 64)) {
    if (!entry || typeof entry !== "object") continue
    const { name, description, inputSchema } = entry as Record<string, unknown>
    if (typeof name !== "string" || !name || name.length > 256 || typeof description !== "string") continue
    catalog.push({ name, description: description.slice(0, 4096), ...(inputSchema === undefined ? {} : { inputSchema }) })
  }
  return catalog
}
