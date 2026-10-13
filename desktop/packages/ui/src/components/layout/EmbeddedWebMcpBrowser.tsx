import * as React from "react"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/icon/Icon"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"
import { getDesktopBridge } from "@/lib/desktopBridge"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { useWebMcpBrowserStore, type WebMcpBrowserErrorCode } from "@/stores/useWebMcpBrowserStore"
import { describeWebMcpError } from "@/lib/webMcpSummary"
import { WebMcpStatusDot } from "@/components/mcp/WebMcpBrowserTools"
import { useWebMcpCapabilityProbe, useWebMcpSummary } from "@/hooks/useWebMcpBrowser"

type BrowserStatus = {
  id: string
  nativeAvailable: boolean
  enabled: boolean
  origin: string | null
  tools: number
  url?: string
}

const invoke = <T,>(args: Record<string, unknown>): Promise<T> => {
  const bridge = getDesktopBridge()
  if (!bridge?.invoke) return Promise.reject(new Error("The desktop browser is unavailable"))
  return bridge.invoke<T>("desktop_webmcp_browser", args)
}

const TOOLBAR_BUTTON_CLASS =
  "inline-flex h-7 items-center gap-1 rounded-md px-2 typography-meta text-muted-foreground transition-colors hover:bg-interactive-hover hover:text-foreground disabled:opacity-50 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)]"

/**
 * The native project browser: a sandboxed Chromium view owned by Electron main.
 * Agent access (native WebMCP) is off for every fresh browser and is only
 * switched here, after the user sees which page would expose tools.
 */
function AgentBrowser({ directory, initialUrl }: { directory: string; initialUrl: string }) {
  const { t } = useI18n()
  const sessionID = useSessionUIStore((state) => state.currentSessionId)
  const updateSnapshot = useWebMcpBrowserStore((state) => state.updateSnapshot)
  const resetSnapshot = useWebMcpBrowserStore((state) => state.resetSnapshot)
  const browserId = useWebMcpBrowserStore((state) => state.browserId)
  const phase = useWebMcpBrowserStore((state) => state.phase)
  const enabled = useWebMcpBrowserStore((state) => state.enabled)
  const nativeAvailable = useWebMcpBrowserStore((state) => state.nativeAvailable)
  const runtimeCompatible = useWebMcpBrowserStore((state) => state.runtimeCompatible)
  const busy = useWebMcpBrowserStore((state) => state.busy)
  const summary = useWebMcpSummary()
  const [url, setUrl] = React.useState(initialUrl || "about:blank")
  const [pendingAction, setPendingAction] = React.useState<string | null>(null)
  const host = React.useRef<HTMLDivElement>(null)
  const addressRef = React.useRef<HTMLInputElement>(null)
  // The preview pane persists its URL whenever it unmounts; that must not recreate this browser.
  const initialUrlRef = React.useRef(initialUrl)
  initialUrlRef.current = initialUrl
  // Bumped whenever a new browser lifecycle starts so late replies from an old one are dropped.
  const lifecycleRef = React.useRef(0)

  // Poll results never clear an operation error; only the next command or lifecycle does.
  const applyStatus = React.useCallback(
    (result: BrowserStatus, lifecycle: number) => {
      if (lifecycleRef.current !== lifecycle) return
      // Follow in-page navigation unless the user is editing the address.
      if (result.url && result.url !== "about:blank" && document.activeElement !== addressRef.current) {
        setUrl(result.url)
      }
      updateSnapshot({
        phase: "ready",
        browserId: result.id,
        nativeAvailable: result.nativeAvailable,
        enabled: result.enabled,
        origin: result.origin,
        tools: result.tools,
      })
    },
    [updateSnapshot],
  )

  useWebMcpCapabilityProbe(directory)

  // A project/session change always creates a fresh browser with agent access off.
  React.useEffect(() => {
    let disposed = false
    let id: string | undefined
    const lifecycle = ++lifecycleRef.current
    resetSnapshot()
    updateSnapshot({ directory, sessionID })
    if (!sessionID) {
      updateSnapshot({ phase: "error", error: "session-required" })
      return () => resetSnapshot()
    }
    updateSnapshot({ phase: "starting" })
    void invoke<BrowserStatus>({ action: "create", directory, sessionID, url: initialUrlRef.current || "about:blank" })
      .then((result) => {
        id = result.id
        if (disposed) void invoke({ action: "close", id }).catch(() => {})
        else applyStatus(result, lifecycle)
      })
      .catch(() => {
        if (!disposed && lifecycleRef.current === lifecycle) updateSnapshot({ phase: "error", error: "start-failed" })
      })
    return () => {
      disposed = true
      if (id) void invoke({ action: "close", id }).catch(() => {})
      resetSnapshot()
    }
  }, [applyStatus, directory, resetSnapshot, sessionID, updateSnapshot])

  React.useEffect(() => {
    if (!browserId || !host.current) return
    const id = browserId
    const lifecycle = lifecycleRef.current
    let disposed = false
    let frame = 0
    let previous = ""
    let pollFailures = 0
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
          pollFailures = 0
          if (!disposed) applyStatus(result, lifecycle)
        })
        .catch(() => {
          // One missed poll is noise; three in a row means the browser really went away.
          pollFailures += 1
          if (!disposed && pollFailures >= 3 && lifecycleRef.current === lifecycle) {
            updateSnapshot({ phase: "error", error: "disconnected" })
          }
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
  }, [applyStatus, browserId, updateSnapshot])

  const command = React.useCallback(
    async (action: "navigate" | "reload" | "enable" | "disconnect", extra: Record<string, unknown> = {}) => {
      if (!browserId || busy) return
      const lifecycle = lifecycleRef.current
      setPendingAction(action)
      updateSnapshot({ busy: true, error: null })
      try {
        const result = await invoke<BrowserStatus>({ action, id: browserId, ...extra })
        if (lifecycleRef.current !== lifecycle) return
        applyStatus(result, lifecycle)
      } catch {
        if (lifecycleRef.current !== lifecycle) return
        const error: WebMcpBrowserErrorCode =
          action === "enable"
            ? runtimeCompatible === false
              ? "runtime-incompatible"
              : "enable-failed"
            : "operation-failed"
        updateSnapshot({ error })
      } finally {
        setPendingAction(null)
        if (lifecycleRef.current === lifecycle) updateSnapshot({ busy: false })
      }
    },
    [applyStatus, browserId, busy, runtimeCompatible, updateSnapshot],
  )

  const ready = phase === "ready" && Boolean(browserId)
  const canEnable = ready && nativeAvailable && runtimeCompatible !== false
  const error = useWebMcpBrowserStore((state) => state.error)
  const showErrorBanner = Boolean(browserId) && error !== null && error !== "session-required"

  return (
    <div className="flex h-full min-h-0 flex-col">
      <form
        className="flex items-center gap-1.5 border-b border-border/40 px-2 py-1.5"
        onSubmit={(event) => {
          event.preventDefault()
          void command("navigate", { url })
        }}
      >
        <div className="relative min-w-0 flex-1">
          <Icon
            name="global"
            className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <input
            ref={addressRef}
            aria-label={t("webmcp.browser.addressAria")}
            placeholder={t("webmcp.browser.addressPlaceholder")}
            className="h-7 w-full rounded-md border border-transparent bg-[var(--surface-elevated)] pl-7 pr-2 font-mono typography-meta text-foreground outline-none transition-colors focus-visible:border-[var(--interactive-border-focus)]"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
        </div>
        <button type="submit" className={TOOLBAR_BUTTON_CLASS} disabled={!ready || busy}>
          {t("webmcp.browser.go")}
        </button>
        <button
          type="button"
          className={TOOLBAR_BUTTON_CLASS}
          disabled={!ready || busy}
          onClick={() => void command("reload")}
          aria-label={t("webmcp.browser.reload")}
          title={t("webmcp.browser.reload")}
        >
          <Icon name="refresh" className="h-3.5 w-3.5" />
        </button>
      </form>

      <div className="flex items-center gap-3 border-b border-border/40 px-2.5 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <WebMcpStatusDot tone={summary.tone} className={cn(enabled && "status-dot-running")} />
          <span className="typography-meta font-medium text-foreground">{summary.stateLabel}</span>
          <span className="typography-micro truncate text-muted-foreground" title={summary.detail}>
            {summary.detail}
          </span>
        </div>
        {enabled ? (
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={!ready || busy}
            onClick={() => void command("disconnect")}
          >
            {t("webmcp.actions.disconnect")}
          </Button>
        ) : (
          <Button type="button" size="xs" disabled={!canEnable || busy} onClick={() => void command("enable")}>
            {pendingAction === "enable" ? t("webmcp.actions.enabling") : t("webmcp.actions.enable")}
          </Button>
        )}
      </div>

      {!enabled && ready ? (
        <p className="border-b border-border/40 px-2.5 py-1.5 typography-micro text-muted-foreground">
          {t("webmcp.browser.explanation")}
        </p>
      ) : null}

      {showErrorBanner ? (
        <p
          role="alert"
          className="flex items-start gap-2 border-b border-border/40 bg-[color-mix(in_srgb,var(--status-error)_10%,transparent)] px-2.5 py-1.5 typography-micro text-foreground"
        >
          <Icon name="error-warning" className="mt-px h-3.5 w-3.5 shrink-0 text-[var(--status-error)]" />
          <span>{t(describeWebMcpError(error))}</span>
        </p>
      ) : null}

      <div ref={host} className="relative min-h-0 flex-1 bg-background">
        {!browserId ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <Icon name="global" className="h-8 w-8 text-muted-foreground/60" />
            <p className="typography-meta text-muted-foreground">
              {phase === "starting"
                ? t("webmcp.detail.starting")
                : sessionID
                  ? t("webmcp.detail.startFailed")
                  : t("webmcp.detail.sessionRequired")}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Switches the context-panel browser between the ordinary preview browser and
 * the agent-enabled project browser. Other surfaces (Services → MCP, Settings →
 * MCP) ask for agent mode through the shared store; this component answers.
 */
export function EmbeddedBrowserChoice({
  directory,
  initialUrl,
  children,
}: {
  directory: string
  initialUrl: string
  children: React.ReactNode
}) {
  const { t } = useI18n()
  const [agentBrowser, setAgentBrowser] = React.useState(false)
  const agentModeRequests = useWebMcpBrowserStore((state) => state.agentModeRequests)
  const consumeAgentModeRequest = useWebMcpBrowserStore((state) => state.consumeAgentModeRequest)

  React.useEffect(() => {
    if (consumeAgentModeRequest()) setAgentBrowser(true)
  }, [agentModeRequests, consumeAgentModeRequest])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        role="tablist"
        aria-label={t("webmcp.browser.modeAria")}
        className="flex items-center gap-1 border-b border-border/40 px-2 py-1"
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault()
            setAgentBrowser((current) => !current)
          }
        }}
      >
        {(
          [
            { id: "preview", active: !agentBrowser, label: t("webmcp.browser.mode.preview"), icon: "window" },
            { id: "agent", active: agentBrowser, label: t("webmcp.browser.mode.agent"), icon: "global" },
          ] as const
        ).map((mode) => (
          <button
            key={mode.id}
            id={`webmcp-mode-tab-${mode.id}`}
            type="button"
            role="tab"
            aria-selected={mode.active}
            aria-controls="webmcp-mode-panel"
            tabIndex={mode.active ? 0 : -1}
            onClick={() => setAgentBrowser(mode.id === "agent")}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md px-2 typography-meta transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)]",
              mode.active
                ? "bg-interactive-selection text-interactive-selection-foreground"
                : "text-muted-foreground hover:bg-interactive-hover hover:text-foreground",
            )}
          >
            <Icon name={mode.icon} className="h-3.5 w-3.5" />
            {mode.label}
          </button>
        ))}
      </div>
      <div
        id="webmcp-mode-panel"
        role="tabpanel"
        aria-labelledby={agentBrowser ? "webmcp-mode-tab-agent" : "webmcp-mode-tab-preview"}
        className="relative min-h-0 flex-1"
      >
        {agentBrowser ? <AgentBrowser directory={directory} initialUrl={initialUrl} /> : children}
      </div>
    </div>
  )
}
