import React from "react"
import { viewKeyFor } from "@/lib/webMcpViewKey"
import { useWebMcpBrowserStore, type WebMcpBrowserErrorCode } from "@/stores/useWebMcpBrowserStore"

/** Invalidate polls before pruning cleared views; terminal feedback lives only in the selected pane. */
export function useWebMcpStorageEvents(onChange?: (key: string, id: string, error: WebMcpBrowserErrorCode) => void) {
  const revision = React.useRef(0)
  React.useEffect(() => {
    const receive = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (
        !Array.isArray(detail?.views) ||
        !["storage-clearing", "storage-cleared", "operation-failed"].includes(detail.error)
      )
        return
      revision.current += 1
      for (const view of detail.views) {
        if (
          typeof view?.id !== "string" ||
          typeof view.directory !== "string" ||
          (view.sessionID !== null && typeof view.sessionID !== "string")
        )
          continue
        const key = viewKeyFor(view.directory, view.sessionID)
        onChange?.(key, view.id, detail.error)
        const state = useWebMcpBrowserStore.getState()
        const current = state.activeKey === key ? state : state.views[key]
        if (
          current?.browserId !== view.id &&
          !(
            state.activeKey === key &&
            !current?.browserId &&
            ["storage-clearing", "storage-cleared"].includes(current?.error ?? "")
          )
        )
          continue
        state.resetView(key, detail.error)
      }
    }
    window.addEventListener("openchamber:webmcp-storage", receive)
    return () => window.removeEventListener("openchamber:webmcp-storage", receive)
  }, [onChange])
  return revision
}
