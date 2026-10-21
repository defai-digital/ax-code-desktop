import React from "react"
import { useWebMcpStorageEvents } from "./useWebMcpStorageEvents"
import { isElectronShell } from "@/lib/desktop"
import { getDesktopBridge } from "@/lib/desktopBridge"
import { viewKeyFor } from "@/lib/webMcpViewKey"
import { pauseChromeBridgeForProjectBrowser, resumeChromeBridgeForProjectBrowser } from "@/lib/webMcpBridgeCoordination"
import { readWebMcpCatalog, useWebMcpBrowserStore, type WebMcpBrowserSnapshot } from "@/stores/useWebMcpBrowserStore"

type NativeView = Pick<
  WebMcpBrowserSnapshot,
  | "directory"
  | "sessionID"
  | "nativeAvailable"
  | "enabled"
  | "origin"
  | "paused"
  | "visible"
  | "waiting"
  | "tools"
  | "page"
  | "error"
> & {
  id: string
  catalog?: unknown
}

/** One window-level projection, including hidden pages; it never enrolls or shows a view. */
export function useWebMcpPoolProjection(enabled = true) {
  const storageRevision = useWebMcpStorageEvents()
  React.useEffect(() => {
    const bridge = getDesktopBridge()
    if (!enabled || !isElectronShell() || !bridge?.invoke) return
    const invoke = bridge.invoke
    let disposed = false
    let polling = false
    const poll = async () => {
      if (polling) return
      polling = true
      const revision = storageRevision.current
      const before = useWebMcpBrowserStore.getState().views
      try {
        const result = await invoke<{ views?: NativeView[] }>("desktop_webmcp_browser", { action: "list" })
        if (disposed || revision !== storageRevision.current || !Array.isArray(result?.views)) return
        const ids = new Set<string>()
        for (const view of result.views) {
          if (
            !view ||
            typeof view.id !== "string" ||
            typeof view.directory !== "string" ||
            (view.sessionID !== null && typeof view.sessionID !== "string")
          )
            continue
          ids.add(view.id)
          const key = viewKeyFor(view.directory, view.sessionID)
          const store = useWebMcpBrowserStore.getState()
          const current = store.views[key]
          if (current?.busy || current?.phase === "starting") continue
          store.updateView(key, {
            phase: "ready",
            browserId: view.id,
            directory: view.directory,
            sessionID: view.sessionID,
            ...(view.enabled ? { runtimeCompatible: true } : {}),
            nativeAvailable: view.nativeAvailable,
            enabled: view.enabled,
            origin: view.origin,
            paused: view.paused,
            visible: view.visible,
            waiting: view.waiting,
            tools: view.tools,
            page: view.page,
            catalog: readWebMcpCatalog(view.catalog),
            error: view.error ?? (current?.error === "operation-failed" ? current.error : null),
            pausedBridgeServers: held.current.get(view.directory) ?? [],
          })
        }
        for (const [key, prior] of Object.entries(before)) {
          const current = useWebMcpBrowserStore.getState().views[key]
          if (
            prior.browserId &&
            !ids.has(prior.browserId) &&
            current?.browserId === prior.browserId &&
            current.phase !== "starting"
          ) {
            useWebMcpBrowserStore.getState().resetView(key)
          }
        }
      } catch {
        // Older main processes have no pool listing; their pane keeps polling status.
      } finally {
        polling = false
      }
    }
    void poll()
    const timer = setInterval(() => void poll(), 1000)
    return () => {
      disposed = true
      clearInterval(timer)
    }
  }, [enabled, storageRevision])

  const enrolled = useWebMcpBrowserStore((state) =>
    JSON.stringify(
      [
        ...new Set(
          Object.values(state.views)
            .filter((view) => view.enabled && view.directory)
            .map((view) => view.directory!),
        ),
      ].sort(),
    ),
  )
  const held = React.useRef(new Map<string, string[]>())
  const coordination = React.useRef(Promise.resolve())
  React.useEffect(() => {
    if (!enabled || !isElectronShell()) return
    const desired = new Set<string>(JSON.parse(enrolled))
    coordination.current = coordination.current
      .catch(() => {})
      .then(async () => {
        for (const directory of held.current.keys()) {
          if (desired.has(directory)) continue
          await resumeChromeBridgeForProjectBrowser(directory)
          held.current.delete(directory)
          const store = useWebMcpBrowserStore.getState()
          for (const [key, view] of Object.entries(store.views)) {
            if (view.directory === directory) store.updateView(key, { pausedBridgeServers: [] })
          }
        }
        for (const directory of desired) {
          if (held.current.has(directory)) continue
          const pausedBridgeServers = await pauseChromeBridgeForProjectBrowser(directory)
          held.current.set(directory, pausedBridgeServers)
          const store = useWebMcpBrowserStore.getState()
          for (const [key, view] of Object.entries(store.views)) {
            if (view.directory === directory) store.updateView(key, { pausedBridgeServers })
          }
        }
      })
  }, [enabled, enrolled])
}
