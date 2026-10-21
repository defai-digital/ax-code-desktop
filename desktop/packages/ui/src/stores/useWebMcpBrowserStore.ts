import { create } from "zustand"
import { viewKeyFor } from "@/lib/webMcpViewKey"
import { normalizeProjectPath } from "@/lib/projectResolution"
import {
  diffWebMcpRegistration,
  markWebMcpRunsStale,
  readWebMcpCatalog,
  WEBMCP_DRAFT_LIMIT,
  WEBMCP_JOURNAL_LIMIT,
  WEBMCP_RUN_LIMIT,
  type WebMcpCatalogLimit,
  type WebMcpCatalogRejection,
  type WebMcpJournalEntry,
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
  WebMcpJournalEntry,
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
  | "owned-by-another-window"
  | "disconnected"
  | "storage-clearing"
  | "storage-cleared"
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
  interrupted?: boolean
  enabled: boolean
  visible: boolean
  waiting: boolean
  unloaded?: boolean
  idle?: boolean
  origin: string | null
  /** null until the browser reports its first status. */
  page: WebMcpPageKind | null
  tools: number
  /** The page's tools with their descriptions and input schemas, visible before the agent is granted anything. */
  catalog: WebMcpToolDefinition[]
  /** The page document's generation; a new load gets a new one. Calls record the generation they ran on. */
  generation: string | null
  /** How many tools the page registered, and whether the panel stopped at 64 tools or 256 KiB. */
  catalogLimit: WebMcpCatalogLimit
  /** Named reason the latest registration was refused. Null when the catalog was accepted. */
  catalogRejection: WebMcpCatalogRejection | null
  busy: boolean
  error: WebMcpBrowserErrorCode | null
  /** Chrome-bridge MCP servers paused while this browser is enrolled (see lib/webMcpBridgeCoordination). */
  pausedBridgeServers: string[]
}

export interface WebMcpViewSnapshot extends WebMcpBrowserSnapshot {
  /** Latest registration changes for the current page. In memory only, capped. */
  registration: readonly WebMcpRegistrationEvent[]
  /** Form drafts keyed by tool name. Kept across a same-definition reload; not written to disk. */
  toolDrafts: Record<string, WebMcpToolDraft>
  /** Manual results keyed by tool name. A changed definition is marked stale. */
  toolRuns: Record<string, WebMcpToolRun>
  /** The last 32 Try it runs on this page view, newest first. In memory only. */
  toolJournal: readonly WebMcpJournalEntry[]
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
  capacity: { liveViews: number; maxLiveViews: number; otherWindows?: { id: string; pageCount: number }[] } | null
  selectView: (directory: string, sessionID: string | null) => void
  releaseView: (key: string) => void
  updateView: (key: string, partial: WebMcpSnapshotUpdate) => void
  resetView: (key: string, error?: WebMcpBrowserErrorCode) => void
  /** Settings → MCP shows the browser-tools card instead of a server page. */
  settingsCardSelected: boolean
  updateSnapshot: (partial: WebMcpSnapshotUpdate) => void
  saveToolDraft: (name: string, draft: WebMcpToolDraft, key?: string) => void
  recordToolRun: (name: string, run: WebMcpToolRun, key?: string) => void
  clearToolRun: (name: string, key?: string) => void
  recordToolJournal: (entry: WebMcpJournalEntry, key?: string) => void
  resetSnapshot: () => void
  requestAgentMode: (options?: { enable?: boolean }, key?: string) => void
  consumeAgentModeRequest: (key?: string) => boolean
  consumeEnableRequest: (key?: string) => boolean
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
  interrupted: false,
  visible: false,
  waiting: false,
  unloaded: false,
  idle: false,
  origin: null,
  page: null,
  tools: 0,
  catalog: [],
  generation: null,
  catalogLimit: { total: 0, shown: 0, truncation: null },
  catalogRejection: null,
  busy: false,
  error: null,
  pausedBridgeServers: [],
}

const requestCounters = { agentModeRequests: 0, agentModeConsumed: 0, enableRequests: 0, enableConsumed: 0 }
const initialCatalogState = { registration: [], toolDrafts: {}, toolRuns: {}, toolJournal: [] }
export const emptyWebMcpView: WebMcpViewSnapshot = { ...initialSnapshot, ...initialCatalogState, ...requestCounters }

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
  const update = (state: WebMcpViewSnapshot, partial: WebMcpSnapshotUpdate) => {
    // Normalize untrusted catalog bytes before writing either projection.
    const { catalog, catalogRejection, ...rest } = partial
    void catalog
    void catalogRejection
    return { ...rest, ...observeCatalog(state, partial) }
  }
  const editTools = (key: string | null, edit: (view: WebMcpViewSnapshot) => Partial<WebMcpViewSnapshot>) => {
    const state = get()
    const view = key ? state.views[key] : state
    // A late manual completion must not recreate a closed view.
    if (!view) return
    const partial = edit(view)
    if (key) write(key, partial)
    else set(partial)
  }
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
    capacity: null,
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
    updateView: (key, partial) => {
      const state = get()
      write(key, update(state.activeKey === key ? state : (state.views[key] ?? emptyWebMcpView), partial))
    },
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
      if (state.activeKey) write(state.activeKey, update(state, partial))
      else set(update(state, partial))
    },
    saveToolDraft: (name, draft, key = get().activeKey ?? undefined) =>
      editTools(key ?? null, (state) => {
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
    recordToolRun: (name, run, key = get().activeKey ?? undefined) =>
      editTools(key ?? null, (state) => {
        if (!name || name.length > 256 || run.digest.length > 64) return {}
        const next = { ...state.toolRuns }
        delete next[name]
        next[name] = {
          digest: run.digest,
          outcome: run.outcome.slice(0, 64),
          text: run.text.slice(0, 4000),
          stale:
            run.stale === true ||
            Boolean(state.catalog.find((tool) => tool.name === name && tool.digest !== run.digest)),
        }
        const names = Object.keys(next)
        while (names.length > WEBMCP_RUN_LIMIT) {
          const oldest = names.shift()
          if (oldest) delete next[oldest]
        }
        return { toolRuns: next }
      }),
    clearToolRun: (name, key = get().activeKey ?? undefined) =>
      editTools(key ?? null, (state) => {
        if (!Object.hasOwn(state.toolRuns, name)) return {}
        const next = { ...state.toolRuns }
        delete next[name]
        return { toolRuns: next }
      }),
    recordToolJournal: (entry, key = get().activeKey ?? undefined) =>
      editTools(key ?? null, (state) => {
        const input = boundJournalInput(entry.input)
        if (
          !entry.tool ||
          entry.tool.length > 256 ||
          entry.digest.length > 64 ||
          (entry.definitionDigest !== undefined && !/^[a-f0-9]{64}$/.test(entry.definitionDigest)) ||
          entry.id.length > 64 ||
          !Number.isFinite(entry.durationMs) ||
          !input
        )
          return {}
        const next = [
          {
            id: entry.id,
            tool: entry.tool,
            input,
            outcome: entry.outcome.slice(0, 64),
            text: entry.text.slice(0, 4000),
            durationMs: Math.min(86_400_000, Math.max(0, Math.round(entry.durationMs))),
            digest: entry.digest,
            definitionDigest: entry.definitionDigest,
            at: Number.isFinite(entry.at) ? entry.at : Date.now(),
          },
          ...state.toolJournal.filter((item) => item.id !== entry.id),
        ].slice(0, WEBMCP_JOURNAL_LIMIT)
        return { toolJournal: next }
      }),
    resetSnapshot: () => {
      const state = get()
      const partial = { ...initialSnapshot, ...initialCatalogState, runtimeCompatible: state.runtimeCompatible }
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
 * Page identity for drafts, results, the manual journal and the registration timeline. An origin change drops them.
 * Catalog updates diff the definitions already on the page. Nothing here is written to disk.
 */
function observeCatalog(
  state: {
    origin: string | null
    catalog: readonly WebMcpToolDefinition[]
    registration: readonly WebMcpRegistrationEvent[]
    toolDrafts: Record<string, WebMcpToolDraft>
    toolRuns: Record<string, WebMcpToolRun>
    toolJournal: readonly WebMcpJournalEntry[]
  },
  partial: WebMcpSnapshotUpdate,
): Partial<WebMcpBrowserSnapshot> &
  Partial<Pick<WebMcpBrowserState, "registration" | "toolDrafts" | "toolRuns" | "toolJournal">> {
  const originChanged = partial.origin !== undefined && partial.origin !== state.origin
  if (!("catalog" in partial) && !originChanged && !("catalogRejection" in partial) && !("catalogLimit" in partial)) {
    return {}
  }
  const next: Partial<WebMcpBrowserSnapshot> &
    Partial<Pick<WebMcpBrowserState, "registration" | "toolDrafts" | "toolRuns" | "toolJournal">> = {}
  // Keep the same array when the catalog is unchanged so a status poll does not rebuild the timeline.
  let registration = originChanged ? [] : state.registration
  const toolDrafts = originChanged ? {} : state.toolDrafts
  let toolRuns = originChanged ? {} : state.toolRuns
  const toolJournal = originChanged ? [] : state.toolJournal
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
    if (originChanged) next.toolJournal = toolJournal
  }
  return next
}

function boundJournalInput(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  try {
    const text = JSON.stringify(value)
    if (!text || text.length > 65536 || text[0] !== "{") return null
    const parsed: unknown = JSON.parse(text)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}
