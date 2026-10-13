import React from "react"
import { useShallow } from "zustand/react/shallow"
import { useI18n } from "@/lib/i18n"
import { isElectronShell } from "@/lib/desktop"
import { getDesktopBridge } from "@/lib/desktopBridge"
import { summarizeWebMcpBrowser } from "@/lib/webMcpSummary"
import { useWebMcpBrowserStore } from "@/stores/useWebMcpBrowserStore"
import { useUIStore } from "@/stores/useUIStore"
import { useDirectoryStore } from "@/stores/useDirectoryStore"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { toast } from "@/components/ui"

/**
 * Hooks shared by every WebMCP surface (Services → MCP, Settings → MCP and the
 * project browser pane) so all of them describe the same browser the same way.
 */
export function useWebMcpSummary() {
  const { t } = useI18n()
  const snapshot = useWebMcpBrowserStore(
    useShallow((state) => ({
      phase: state.phase,
      nativeAvailable: state.nativeAvailable,
      runtimeCompatible: state.runtimeCompatible,
      enabled: state.enabled,
      origin: state.origin,
      page: state.page,
      tools: state.tools,
      error: state.error,
    })),
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
  const directory = ui.newSessionDraft?.directoryOverride ?? useDirectoryStore.getState().currentDirectory ?? null
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
      requestAgentMode(options)
      focusContextBrowser()
      if (options?.enable) {
        void ensureSessionForProjectBrowser(t("webmcp.session.title")).then((started) => {
          if (!started) toast.error(t("webmcp.detail.sessionRequired"))
        })
      }
    },
    [focusContextBrowser, requestAgentMode, t],
  )
}

const CAPABILITY_CACHE_MS = 60_000
// The answer describes the one supervised runtime, not a project, so a single cache entry is enough.
let capabilityCache: { at: number; compatible: boolean } | null = null

type CapabilityProbeResult = { compatible?: boolean; reachable?: boolean }

/**
 * Asks the runtime, at most once a minute, whether it accepts the desktop browser provider.
 * Every surface can call this so an old runtime is explained before a browser exists. An
 * unreachable runtime leaves the answer unknown instead of claiming incompatibility; only
 * definite answers are cached.
 */
export function useWebMcpCapabilityProbe(directory: string | null) {
  const updateSnapshot = useWebMcpBrowserStore((state) => state.updateSnapshot)
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
      .invoke<CapabilityProbeResult>("desktop_webmcp_browser", { action: "capability", directory })
      .then((result) => {
        if (result?.reachable === false) {
          if (!disposed) updateSnapshot({ runtimeCompatible: null })
          return
        }
        const compatible = Boolean(result?.compatible)
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
