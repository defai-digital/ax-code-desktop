import React from "react"
import { useShallow } from "zustand/react/shallow"
import { viewKeyFor } from "@/lib/webMcpViewKey"
import { normalizeProjectPath } from "@/lib/projectResolution"
import { useI18n } from "@/lib/i18n"
import { isElectronShell } from "@/lib/desktop"
import { getDesktopBridge } from "@/lib/desktopBridge"
import { summarizeWebMcpBrowser } from "@/lib/webMcpSummary"
import { emptyWebMcpView, useWebMcpBrowserStore, type WebMcpViewSnapshot } from "@/stores/useWebMcpBrowserStore"
import { useUIStore } from "@/stores/useUIStore"
import { useDirectoryStore } from "@/stores/useDirectoryStore"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { toast } from "@/components/ui"

/**
 * Hooks shared by every WebMCP surface (Services → MCP, Settings → MCP and the
 * project browser pane) so all of them describe the same browser the same way.
 */
export function useCurrentWebMcpViewKey() {
  const sessionID = useSessionUIStore((state) => state.currentSessionId)
  const draftDirectory = useSessionUIStore((state) => state.newSessionDraft?.directoryOverride)
  const directory = useDirectoryStore((state) => state.currentDirectory)
  return viewKeyFor((!sessionID && draftDirectory) || directory || "", sessionID)
}

/** Subscribe to a value of this project/session without following another pane's selection. */
export function useWebMcpBrowserValue<T>(selector: (view: WebMcpViewSnapshot) => T, key?: string): T {
  const currentKey = useCurrentWebMcpViewKey()
  const target = key ?? currentKey
  return useWebMcpBrowserStore((state) =>
    selector(
      state.activeKey === target || (!state.activeKey && state.order.length === 0)
        ? state
        : (state.views[target] ?? emptyWebMcpView),
    ),
  )
}

export function useWebMcpSummary(key?: string) {
  const currentKey = useCurrentWebMcpViewKey()
  const { t } = useI18n()
  const snapshot = useWebMcpBrowserStore(
    useShallow((state) => {
      const target = key ?? currentKey
      const view =
        state.activeKey === target || (!state.activeKey && state.order.length === 0)
          ? state
          : (state.views[target] ?? emptyWebMcpView)
      return {
        phase: view?.phase ?? "idle",
        paused: view?.paused ?? false,
        nativeAvailable: view?.nativeAvailable ?? false,
        runtimeCompatible: view?.runtimeCompatible ?? state.runtimeCompatible,
        enabled: view?.enabled ?? false,
        interrupted: view?.interrupted ?? false,
        origin: view?.origin ?? null,
        page: view?.page ?? null,
        tools: view?.tools ?? 0,
        error: view?.error ?? null,
      }
    }),
  )
  const summary = React.useMemo(() => summarizeWebMcpBrowser(snapshot, { isElectron: isElectronShell() }), [snapshot])
  return {
    ...summary,
    stateLabel: t(summary.stateKey),
    detail: t(summary.detailKey, summary.detailParams),
  }
}

/**
 * Agent access binds to a coding session, and the app lands in a session draft that has none.
 * When the user asks for access from a draft, start the session in the draft's project first so
 * one click is enough. Returns false when no session could be started.
 */
export async function ensureSessionForProjectBrowser(title: string): Promise<boolean> {
  const ui = useSessionUIStore.getState()
  if (ui.currentSessionId) return true
  const directory = normalizeProjectPath(
    ui.newSessionDraft?.directoryOverride ?? useDirectoryStore.getState().currentDirectory,
  )
  if (!directory) return false
  const session = await ui.createSession(title, directory)
  return Boolean(session)
}

/**
 * Opens (or focuses) the context-panel browser and asks it for agent mode. With `enable`, the
 * pane also turns agent access on once the browser is ready; that is the user's explicit click.
 */
export function useOpenProjectBrowser() {
  const { t } = useI18n()
  const focusContextBrowser = useUIStore((state) => state.focusContextBrowser)
  const requestAgentMode = useWebMcpBrowserStore((state) => state.requestAgentMode)
  return React.useCallback(
    (options?: { enable?: boolean }) => {
      const ui = useSessionUIStore.getState()
      const active = useWebMcpBrowserStore.getState()
      const directory = normalizeProjectPath(
        active.activeKey && active.sessionID === ui.currentSessionId
          ? active.directory
          : (ui.newSessionDraft?.directoryOverride ?? useDirectoryStore.getState().currentDirectory),
      )
      if (directory) useWebMcpBrowserStore.getState().selectView(directory, ui.currentSessionId)
      const requestedKey = directory ? viewKeyFor(directory, ui.currentSessionId) : undefined
      requestAgentMode(options, requestedKey)
      focusContextBrowser()
      if (options?.enable) {
        const failed = () => {
          useWebMcpBrowserStore.getState().consumeEnableRequest(requestedKey)
          toast.error(t("webmcp.detail.sessionRequired"))
        }
        void ensureSessionForProjectBrowser(t("webmcp.session.title")).then((started) => {
          if (!started) {
            failed()
            return
          }
        }, failed)
      }
    },
    [focusContextBrowser, requestAgentMode, t],
  )
}

const CAPABILITY_CACHE_MS = 60_000
// The answer describes the one supervised runtime, not a project, so a single cache entry is enough.
let capabilityCache: { at: number; compatible: boolean } | null = null

type CapabilityProbeResult = { compatible?: boolean | null; reachable?: boolean }
export const webMcpCompatibility = (result: CapabilityProbeResult | null | undefined): boolean | null =>
  result?.reachable === false || typeof result?.compatible !== "boolean" ? null : result.compatible

/**
 * Asks the runtime, at most once a minute, whether it accepts the desktop browser provider.
 * Every surface can call this so an old runtime is explained before a browser exists. An
 * unreachable runtime leaves the answer unknown instead of claiming incompatibility; only
 * definite answers are cached.
 */
export function useWebMcpCapabilityProbe(directory: string | null) {
  const sessionID = useSessionUIStore((state) => state.currentSessionId)
  const key = directory ? viewKeyFor(directory, sessionID) : null
  const updateSnapshot = React.useCallback(
    (partial: { runtimeCompatible: boolean | null }) => {
      if (key) useWebMcpBrowserStore.getState().updateView(key, partial)
    },
    [key],
  )
  React.useEffect(() => {
    if (!isElectronShell() || !directory) return
    const cached = capabilityCache
    if (cached && Date.now() - cached.at < CAPABILITY_CACHE_MS) {
      updateSnapshot({ runtimeCompatible: cached.compatible })
      return
    }
    const bridge = getDesktopBridge()
    if (!bridge?.invoke) return
    let disposed = false
    updateSnapshot({ runtimeCompatible: null })
    void bridge
      .invoke<CapabilityProbeResult>("desktop_webmcp_browser", {
        action: "capability",
        directory: normalizeProjectPath(directory),
      })
      .then((result) => {
        if (webMcpCompatibility(result) === null) {
          if (!disposed) updateSnapshot({ runtimeCompatible: null })
          return
        }
        const compatible = webMcpCompatibility(result)!
        capabilityCache = { at: Date.now(), compatible }
        if (!disposed) updateSnapshot({ runtimeCompatible: compatible })
      })
      .catch(() => {
        if (!disposed) updateSnapshot({ runtimeCompatible: null })
      })
    return () => {
      disposed = true
    }
  }, [directory, updateSnapshot])
}
