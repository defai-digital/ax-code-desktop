import * as React from "react"
import { getDesktopBridge } from "@/lib/desktopBridge"
import { useSessionUIStore } from "@/sync/session-ui-store"

type BrowserStatus = {
  id: string
  nativeAvailable: boolean
  enabled: boolean
  origin: string | null
  tools: number
}
const invoke = <T,>(args: Record<string, unknown>): Promise<T> => {
  const bridge = getDesktopBridge()
  if (!bridge?.invoke) return Promise.reject(new Error("The desktop browser is unavailable"))
  return bridge.invoke<T>("desktop_webmcp_browser", args)
}

function AgentBrowser({ directory, initialUrl }: { directory: string; initialUrl: string }) {
  const sessionID = useSessionUIStore((state) => state.currentSessionId)
  const [status, setStatus] = React.useState<BrowserStatus | null>(null)
  const [error, setError] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [url, setUrl] = React.useState(initialUrl || "about:blank")
  const host = React.useRef<HTMLDivElement>(null)
  // A project/session change always creates a fresh browser with agent access off.
  React.useEffect(() => {
    let disposed = false
    let id: string | undefined
    setStatus(null)
    setError("")
    if (!sessionID) return
    void invoke<BrowserStatus>({ action: "create", directory, sessionID, url: initialUrl || "about:blank" })
      .then((result) => {
        id = result.id
        if (disposed) void invoke({ action: "close", id }).catch(() => {})
        else setStatus(result)
      })
      .catch(() => {
        if (!disposed) setError("The native browser could not start. Check the selected coding session.")
      })
    return () => {
      disposed = true
      if (id) void invoke({ action: "close", id }).catch(() => {})
    }
  }, [directory, sessionID, initialUrl])

  const id = status?.id
  React.useEffect(() => {
    if (!id || !host.current) return
    let disposed = false
    let frame = 0
    let previous = ""
    const updateBounds = () => {
      frame = 0
      const element = host.current
      if (!element || disposed) return
      const box = element.getBoundingClientRect()
      const hidden =
        document.hidden ||
        !element.checkVisibility() ||
        Boolean(document.querySelector('[role="dialog"][aria-modal="true"], dialog[open]'))
      const bounds = hidden
        ? { x: 0, y: 0, width: 0, height: 0 }
        : { x: Math.max(0, box.x), y: Math.max(0, box.y), width: box.width, height: box.height }
      const key = JSON.stringify(bounds)
      if (key === previous) return
      previous = key
      void invoke({ action: "bounds", id, ...bounds }).catch(() => {})
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(updateBounds)
    }
    const resize = new ResizeObserver(schedule)
    resize.observe(host.current)
    const modal = new MutationObserver(schedule)
    modal.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["open", "aria-modal", "inert", "style"],
    })
    window.addEventListener("resize", schedule)
    window.addEventListener("scroll", schedule, true)
    document.addEventListener("visibilitychange", schedule)
    schedule()
    const interval = setInterval(() => {
      void invoke<BrowserStatus>({ action: "status", id })
        .then((result) => {
          if (!disposed) setStatus(result)
        })
        .catch(() => {
          if (!disposed) setError("The browser disconnected. Reopen the agent browser to reconnect.")
        })
    }, 1000)
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      clearInterval(interval)
      resize.disconnect()
      modal.disconnect()
      window.removeEventListener("resize", schedule)
      window.removeEventListener("scroll", schedule, true)
      document.removeEventListener("visibilitychange", schedule)
    }
  }, [id])

  const command = async (action: string, extra: Record<string, unknown> = {}) => {
    if (!id || busy) return
    setBusy(true)
    setError("")
    try {
      setStatus(await invoke<BrowserStatus>({ action, id, ...extra }))
    } catch {
      setError(
        action === "enable"
          ? "Agent access is unavailable. A compatible signed coding runtime is required; you do not need to install Chrome."
          : "The browser operation could not complete.",
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <form
        className="flex items-center gap-2 border-b px-2 py-1"
        onSubmit={(event) => {
          event.preventDefault()
          void command("navigate", { url })
        }}
      >
        <input
          aria-label="Agent browser address"
          className="min-w-0 flex-1 rounded border px-2 py-1 text-sm"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
        <button type="submit" disabled={!id || busy}>
          Go
        </button>
        <button type="button" disabled={!id || busy} onClick={() => void command("reload")}>
          Reload
        </button>
      </form>
      <div className="flex items-center gap-2 border-b px-2 py-1 text-xs">
        <span className="min-w-0 flex-1 truncate">
          {status?.origin ?? "Project browser"} · {status?.tools ?? 0} tools
        </span>
        <button
          type="button"
          disabled={!id || busy || !status?.nativeAvailable}
          onClick={() => void command(status?.enabled ? "disconnect" : "enable")}
        >
          {status?.enabled ? "Disconnect agent" : "Enable agent access"}
        </button>
      </div>
      {error && (
        <p role="alert" className="px-2 py-1 text-xs text-destructive">
          {error}
        </p>
      )}
      <div ref={host} className="relative min-h-0 flex-1 bg-background">
        {!id && (
          <p className="p-4 text-sm text-muted-foreground">
            {sessionID ? "Starting project browser…" : "Select a coding session to open its project browser."}
          </p>
        )}
      </div>
    </div>
  )
}

export function EmbeddedBrowserChoice({
  directory,
  initialUrl,
  children,
}: {
  directory: string
  initialUrl: string
  children: React.ReactNode
}) {
  const [agentBrowser, setAgentBrowser] = React.useState(false)
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex gap-3 border-b px-2 py-1 text-xs">
        <button type="button" aria-pressed={!agentBrowser} onClick={() => setAgentBrowser(false)}>
          Browse
        </button>
        <button type="button" aria-pressed={agentBrowser} onClick={() => setAgentBrowser(true)}>
          Agent browser · WebMCP
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        {agentBrowser ? <AgentBrowser directory={directory} initialUrl={initialUrl} /> : children}
      </div>
    </div>
  )
}
