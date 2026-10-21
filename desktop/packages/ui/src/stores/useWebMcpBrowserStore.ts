import { create } from "zustand"
import { viewKeyFor } from "@/lib/webMcpViewKey"
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
  | "storage-clearing"
  | "storage-cleared"
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
  visible: boolean
  waiting: boolean
  origin: string | null
  /** null until the browser reports its first status. */
  page: WebMcpPageKind | null
  tools: number
  /** The page's tools with their descriptions and input schemas, visible before the agent is granted anything. */
  catalog: WebMcpToolDefinition[]
  busy: boolean
  error: WebMcpBrowserErrorCode | null
  /** Chrome-bridge MCP servers paused while this browser is enrolled (see lib/webMcpBridgeCoordination). */
  pausedBridgeServers: string[]
}

export interface WebMcpViewSnapshot extends WebMcpBrowserSnapshot {
  /** Monotonic counter for an explicit request to open this session's pane. */
  agentModeRequests: number
  agentModeConsumed: number
  /** Explicit user requests to enable access; never a standing grant. */
  enableRequests: number
  enableConsumed: number
}

interface WebMcpBrowserState extends WebMcpViewSnapshot {
  views: Record<string, WebMcpViewSnapshot>
  order: string[]
  activeKey: string | null
  selectView: (directory: string, sessionID: string | null) => void
  releaseView: (key: string) => void
  updateView: (key: string, partial: Partial<WebMcpBrowserSnapshot>) => void
  resetView: (key: string, error?: WebMcpBrowserErrorCode) => void
  /** Settings → MCP shows the browser-tools card instead of a server page. */
  settingsCardSelected: boolean
  updateSnapshot: (partial: Partial<WebMcpBrowserSnapshot>) => void
  resetSnapshot: () => void
  requestAgentMode: (options?: { enable?: boolean }, key?: string) => void
  consumeAgentModeRequest: (key?: string) => boolean
  consumeEnableRequest: (key?: string) => boolean
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
  visible: false,
  waiting: false,
  origin: null,
  page: null,
  tools: 0,
  catalog: [],
  busy: false,
  error: null,
  pausedBridgeServers: [],
}

const requestCounters = { agentModeRequests: 0, agentModeConsumed: 0, enableRequests: 0, enableConsumed: 0 }
export const emptyWebMcpView: WebMcpViewSnapshot = { ...initialSnapshot, ...requestCounters }

const snapshotOf = (state: WebMcpViewSnapshot): WebMcpViewSnapshot =>
  Object.fromEntries(
    Object.keys(emptyWebMcpView).map((field) => [field, state[field as keyof WebMcpViewSnapshot]]),
  ) as unknown as WebMcpViewSnapshot

// The top-level fields project the selected pane for existing single-pane consumers.
// Every write also targets an explicit view; switching the pane never resets another session.
export const useWebMcpBrowserStore = create<WebMcpBrowserState>()((set, get) => {
  const write = (key: string, partial: Partial<WebMcpViewSnapshot>) =>
    set((state) => {
      const view = {
        ...(state.activeKey === key ? snapshotOf(state) : (state.views[key] ?? emptyWebMcpView)),
        ...partial,
      }
      const prior = state.views[key]
      const selected = state.activeKey === key ? snapshotOf(state) : prior
      if (
        prior &&
        Object.keys(view).every((field) => {
          const name = field as keyof WebMcpViewSnapshot
          return (
            (Object.is(prior[name], view[name]) || JSON.stringify(prior[name]) === JSON.stringify(view[name])) &&
            (Object.is(selected?.[name], view[name]) || JSON.stringify(selected?.[name]) === JSON.stringify(view[name]))
          )
        })
      )
        return state
      return {
        views: { ...state.views, [key]: view },
        order: state.views[key] ? state.order : [...state.order, key],
        ...(state.activeKey === key ? view : {}),
      }
    })
  const consume = (
    requested: "agentModeRequests" | "enableRequests",
    consumed: "agentModeConsumed" | "enableConsumed",
    key = get().activeKey,
  ) => {
    const state = get()
    const view = key && state.activeKey !== key ? state.views[key] : state
    if (!view || view[requested] <= view[consumed]) return false
    if (key) write(key, { [consumed]: view[requested] })
    else set({ [consumed]: view[requested] })
    return true
  }
  return {
    ...emptyWebMcpView,
    views: {},
    order: [],
    activeKey: null,
    settingsCardSelected: false,
    selectView: (directory, sessionID) => {
      const key = viewKeyFor(directory, sessionID)
      const state = get()
      if (state.activeKey === key) return
      let view = {
        ...(state.views[key] ?? { ...emptyWebMcpView, runtimeCompatible: state.runtimeCompatible }),
        directory,
        sessionID,
      }
      const views = { ...state.views }
      if (state.activeKey && state.views[state.activeKey]) {
        views[state.activeKey] = snapshotOf(state)
        // Carry only an unconsumed explicit draft click into its newly created session.
        if (
          !state.sessionID &&
          sessionID &&
          state.directory !== null &&
          viewKeyFor(state.directory, null) === viewKeyFor(directory, null) &&
          state.enableRequests > state.enableConsumed
        ) {
          view = { ...view, enableRequests: view.enableRequests + 1, agentModeRequests: view.agentModeRequests + 1 }
          views[state.activeKey] = {
            ...views[state.activeKey],
            enableConsumed: state.enableRequests,
            agentModeConsumed: state.agentModeRequests,
          }
        }
      }
      set({
        ...view,
        activeKey: key,
        views: { ...views, [key]: view },
        order: state.views[key] ? state.order : [...state.order, key],
      })
    },
    releaseView: (key) => {
      if (get().views[key]) write(key, { visible: false, busy: false })
    },
    updateView: write,
    resetView: (key, error) =>
      set((state) => {
        const views = { ...state.views }
        delete views[key]
        return {
          views,
          order: state.order.filter((entry) => entry !== key),
          ...(state.activeKey === key
            ? {
                ...emptyWebMcpView,
                directory: state.directory,
                sessionID: state.sessionID,
                phase: error ? ("error" as const) : ("idle" as const),
                error: error ?? null,
              }
            : {}),
        }
      }),
    updateSnapshot: (partial) => {
      const state = get()
      if (state.activeKey) write(state.activeKey, partial)
      else set(partial)
    },
    resetSnapshot: () => {
      const state = get()
      const partial = { ...initialSnapshot, runtimeCompatible: state.runtimeCompatible }
      if (state.activeKey) write(state.activeKey, partial)
      else set(partial)
    },
    requestAgentMode: (options, key = get().activeKey ?? undefined) => {
      const state = get()
      const view = key && state.activeKey !== key ? (state.views[key] ?? emptyWebMcpView) : state
      const partial = {
        agentModeRequests: view.agentModeRequests + 1,
        enableRequests: options?.enable ? view.enableRequests + 1 : view.enableRequests,
      }
      if (key) write(key, partial)
      else set(partial)
    },
    consumeAgentModeRequest: (key) => consume("agentModeRequests", "agentModeConsumed", key),
    consumeEnableRequest: (key) => consume("enableRequests", "enableConsumed", key),
    setSettingsCardSelected: (selected) => set({ settingsCardSelected: selected }),
  }
})

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
    catalog.push({
      name,
      description: description.slice(0, 4096),
      ...(inputSchema === undefined ? {} : { inputSchema }),
    })
  }
  return catalog
}
