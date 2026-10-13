import { create } from "zustand"

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

export type WebMcpBrowserErrorCode =
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
  enabled: boolean
  origin: string | null
  tools: number
  busy: boolean
  error: WebMcpBrowserErrorCode | null
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
  enabled: false,
  origin: null,
  tools: 0,
  busy: false,
  error: null,
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
