import * as React from "react"
import { WebMcpPageSwitcher, WebMcpTrustSummary } from "@/components/mcp/WebMcpPages"
import { useWebMcpStorageEvents } from "@/hooks/useWebMcpStorageEvents"
import { viewKeyFor } from "@/lib/webMcpViewKey"
import { normalizeProjectPath } from "@/lib/projectResolution"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/icon/Icon"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"
import { getDesktopBridge } from "@/lib/desktopBridge"
import { useSessionUIStore } from "@/sync/session-ui-store"
import {
  useWebMcpBrowserStore,
  type WebMcpBrowserErrorCode,
  type WebMcpPageKind,
  readWebMcpCatalog,
  rememberWebMcpAddress,
  restoreWebMcpAddress,
} from "@/stores/useWebMcpBrowserStore"
import { WebMcpToolPanel } from "@/components/mcp/WebMcpToolPanel"
import { WebMcpCallStrip } from "@/components/mcp/WebMcpCallStrip"
import { WebMcpBuilderHint } from "@/components/mcp/WebMcpBuilderHint"
import { describeWebMcpError, webMcpErrorAction } from "@/lib/webMcpSummary"
import { WebMcpStatusDot } from "@/components/mcp/WebMcpBrowserTools"
import {
  useOpenProjectBrowser,
  useWebMcpCapabilityProbe,
  useWebMcpSummary,
  useWebMcpBrowserValue,
} from "@/hooks/useWebMcpBrowser"

type BrowserStatus = {
  id: string
  nativeAvailable: boolean
  visible?: boolean
  unloaded?: boolean
  idle?: boolean
  waiting?: boolean
  paused?: boolean
  stoppedCalls?: number
  error?: WebMcpBrowserErrorCode | null
  reason?: "runtime-incompatible" | "enable-failed" | "session-required"
  interrupted?: boolean
  enabled: boolean
  origin: string | null
  page?: WebMcpPageKind
  tools: number
  catalog?: unknown
  generation?: unknown
  catalogTotal?: number
  catalogTruncation?: "count" | "bytes" | null
  catalogRejection?: unknown
  url?: string
}

/** True while the user is typing somewhere, so enabling the browser never steals the caret. */
const textEntryFocused = () => {
  const active = document.activeElement
  return (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement ||
    (active instanceof HTMLElement && active.isContentEditable)
  )
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
  const key = viewKeyFor(directory, sessionID)
  const updateSnapshot = React.useCallback(
    (partial: Parameters<ReturnType<typeof useWebMcpBrowserStore.getState>["updateSnapshot"]>[0]) => {
      useWebMcpBrowserStore.getState().updateView(key, partial)
    },
    [key],
  )
  const browserId = useWebMcpBrowserValue((state) => state.browserId, key)
  const phase = useWebMcpBrowserValue((state) => state.phase, key)
  const paused = useWebMcpBrowserValue((state) => state.paused, key)
  const waiting = useWebMcpBrowserValue((state) => state.waiting, key)
  const interrupted = useWebMcpBrowserValue((state) => state.interrupted, key)
  const otherWindows = useWebMcpBrowserStore((state) => state.capacity?.otherWindows)
  const enabled = useWebMcpBrowserValue((state) => state.enabled, key)
  const origin = useWebMcpBrowserValue((state) => state.origin, key)
  const nativeAvailable = useWebMcpBrowserValue((state) => state.nativeAvailable, key)
  const runtimeCompatible = useWebMcpBrowserValue((state) => state.runtimeCompatible, key)
  const busy = useWebMcpBrowserValue((state) => state.busy, key)
  const summary = useWebMcpSummary(key)
  const openProjectBrowser = useOpenProjectBrowser()
  const [url, setUrl] = React.useState(initialUrl || "about:blank")
  const [poolFull, setPoolFull] = React.useState(false)
  const [restart, setRestart] = React.useState(0)
  const draftUrl = React.useRef<{ directory: string; url: string } | null>({ directory, url: initialUrl })
  const [pendingAction, setPendingAction] = React.useState<string | null>(null)
  const host = React.useRef<HTMLDivElement>(null)
  const [stoppedCalls, setStoppedCalls] = React.useState(0)
  const accessControlRef = React.useRef<HTMLButtonElement>(null)
  const focusAfterAction = React.useRef<Element | null>(null)
  React.useLayoutEffect(() => {
    if (busy || pendingAction || !focusAfterAction.current) return
    if (document.activeElement === focusAfterAction.current || document.activeElement === document.body) {
      ;(accessControlRef.current ?? addressRef.current)?.focus()
    }
    focusAfterAction.current = null
  }, [busy, pendingAction])
  const addressRef = React.useRef<HTMLInputElement>(null)
  // The preview pane persists its URL whenever it unmounts; that must not recreate this browser.
  const initialUrlRef = React.useRef(initialUrl)
  initialUrlRef.current = initialUrl
  // Bumped whenever a new browser lifecycle starts so late replies from an old one are dropped.
  const lifecycleRef = React.useRef(0)
  const retiredView = React.useRef<{ id: string; error: WebMcpBrowserErrorCode } | null>(null)
  useWebMcpStorageEvents(
    React.useCallback(
      (changedKey: string, id: string, error: WebMcpBrowserErrorCode) => {
        if (changedKey !== key) return
        retiredView.current = { id, error }
        const state = useWebMcpBrowserStore.getState()
        if (state.browserId === id || (!state.browserId && state.error === "storage-clearing")) {
          lifecycleRef.current += 1
        }
      },
      [key],
    ),
  )
  const commandErrorRef = React.useRef<WebMcpBrowserErrorCode | null>(null)
  const currentContext = React.useRef({ directory, sessionID })
  currentContext.current = { directory, sessionID }

  // Main owns page-load errors, including clearing them after a successful navigation.
  // A local IPC failure survives polling until the next explicit command or lifecycle.
  const applyStatus = React.useCallback(
    (result: BrowserStatus, lifecycle: number) => {
      if (lifecycleRef.current !== lifecycle) return
      if (retiredView.current?.id === result.id) {
        useWebMcpBrowserStore.getState().resetView(key, retiredView.current.error)
        return
      }
      // Follow in-page navigation unless the user is editing the address.
      if (result.url && result.url !== "about:blank" && document.activeElement !== addressRef.current) {
        setUrl(result.url)
      }
      if (result.url) {
        rememberWebMcpAddress(directory, sessionID, result.url)
        if (!sessionID) draftUrl.current = { directory, url: result.url }
      }
      const catalog = readWebMcpCatalog(result.catalog, {
        total: result.catalogTotal,
        truncation: result.catalogTruncation,
        rejection: result.catalogRejection,
      })
      updateSnapshot({
        ...(result.error !== undefined ? { error: result.error ?? commandErrorRef.current } : {}),
        ...(result.reason ? { error: result.reason } : {}),
        ...(result.reason === "runtime-incompatible" ? { runtimeCompatible: false } : {}),
        ...(result.enabled ? { runtimeCompatible: true } : {}),
        visible: result.visible ?? false,
        waiting: result.waiting ?? false,
        unloaded: result.unloaded ?? false,
        idle: result.idle ?? false,
        paused: result.paused ?? false,
        phase: "ready",
        browserId: result.id,
        nativeAvailable: result.nativeAvailable,
        enabled: result.enabled,
        interrupted: result.interrupted ?? false,
        origin: result.origin,
        page: result.page ?? null,
        tools: result.tools,
        generation: typeof result.generation === "string" ? result.generation : null,
        catalog: catalog.catalog,
        catalogLimit: catalog.catalogLimit,
        catalogRejection: catalog.catalogRejection,
      })
    },
    [directory, key, sessionID, updateSnapshot],
  )

  useWebMcpCapabilityProbe(directory)

  // Reuse this project/session page; only a fresh view starts with agent access off.
  React.useEffect(() => {
    let disposed = false
    let id: string | undefined
    const lifecycle = ++lifecycleRef.current
    commandErrorRef.current = null
    setPendingAction(null)
    setStoppedCalls(0)
    setPoolFull(false)
    focusAfterAction.current = null
    useWebMcpBrowserStore.getState().selectView(directory, sessionID)
    updateSnapshot({ directory, sessionID })
    updateSnapshot({ phase: "starting" })
    const restored =
      restoreWebMcpAddress(directory, sessionID) ??
      (draftUrl.current?.directory === directory ? draftUrl.current.url : initialUrlRef.current)
    setUrl(restored || "about:blank")
    draftUrl.current = null
    let pooled = false
    const retire = (id: string) =>
      invoke(pooled ? { action: "bounds", id, x: 0, y: 0, width: 0, height: 0 } : { action: "close", id }).catch(
        () => {},
      )
    void (async () => {
      // list is additive: an older main keeps the original close/recreate lifecycle.
      const listing = await invoke<{ views?: BrowserStatus[] }>({ action: "list" }).catch(() => null)
      pooled = Array.isArray(listing?.views)
      const result = await invoke<BrowserStatus>({
        action: "create",
        directory,
        sessionID,
        url: restored || "about:blank",
      })
      id = result.id
      if (disposed) {
        await retire(id)
        return
      }
      const shown = pooled ? await invoke<BrowserStatus>({ action: "show", id }) : result
      if (disposed) {
        await retire(id)
        return
      }
      applyStatus(shown, lifecycle)
    })().catch((error) => {
      if (!disposed && String(error).includes("pool-full")) setPoolFull(true)
      if (!disposed && lifecycleRef.current === lifecycle) {
        if (id && retiredView.current?.id === id) {
          useWebMcpBrowserStore.getState().resetView(key, retiredView.current.error)
        } else updateSnapshot({ phase: "error", error: "start-failed" })
      }
    })
    return () => {
      disposed = true
      if (id) void retire(id)
      // Late replies from the departing pane cannot overwrite its retained snapshot or the new pane.
      lifecycleRef.current += 1
      // Only the draft-to-session transition carries the user's explicit enable click.
      // Pending clicks from an existing session never transfer to another session.
      if (sessionID || !currentContext.current.sessionID || currentContext.current.directory !== directory) {
        useWebMcpBrowserStore.getState().consumeEnableRequest(key)
      }
      if (!pooled) useWebMcpBrowserStore.getState().resetView(key)
      else useWebMcpBrowserStore.getState().releaseView(key)
    }
  }, [applyStatus, directory, key, sessionID, updateSnapshot, restart])

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
      // The app's dialogs are Base UI popups: they carry `role="dialog"` and no `aria-modal`, so testing for
      // `[role="dialog"][aria-modal="true"]` alone did not see the settings window, the command palette or a
      // confirm dialog — the native view stayed over them and swallowed every click inside its rectangle. A native
      // `dialog[open]` and an `aria-modal`-only overlay are matched too.
      const hidden =
        document.hidden ||
        !element.checkVisibility() ||
        Boolean(document.querySelector('[role="dialog"], [role="alertdialog"], [aria-modal="true"], dialog[open]'))
      const bounds = hidden
        ? { x: 0, y: 0, width: 0, height: 0 }
        : { x: Math.max(0, box.x), y: Math.max(0, box.y), width: box.width, height: box.height }
      const key = JSON.stringify(bounds)
      if (key === previous) return
      previous = key
      void invoke<BrowserStatus>({ action: "bounds", id, ...bounds })
        .then((result) => {
          if (!disposed && result) applyStatus(result, lifecycle)
        })
        .catch(() => {})
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
            updateSnapshot({ phase: "error", error: "disconnected", enabled: false, interrupted: false })
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
    async (
      action: "navigate" | "reload" | "enable" | "pause" | "resume" | "disconnect",
      extra: Record<string, unknown> = {},
    ) => {
      if (!browserId || busy) return
      const lifecycle = lifecycleRef.current
      commandErrorRef.current = null
      if (["pause", "resume", "disconnect"].includes(action)) {
        focusAfterAction.current = document.activeElement
        setStoppedCalls(0)
      }
      setPendingAction(action)
      updateSnapshot({ busy: true, error: null })
      try {
        const result = await invoke<BrowserStatus>({ action, id: browserId, ...extra })
        if (lifecycleRef.current !== lifecycle) return
        applyStatus(result, lifecycle)
        if (action === "pause" || action === "disconnect") setStoppedCalls(result.stoppedCalls ?? 0)
        // Access is on but there is no page to grant: the next step is a URL, so offer the address
        // bar unless the user is already typing (the composer chip keeps its own focus).
        if (action === "enable" && !result.origin && !textEntryFocused()) addressRef.current?.focus()
      } catch {
        if (lifecycleRef.current !== lifecycle) return
        const error: WebMcpBrowserErrorCode =
          action === "enable" || action === "resume" ? "enable-failed" : "operation-failed"
        commandErrorRef.current = error
        updateSnapshot({ error })
      } finally {
        if (lifecycleRef.current === lifecycle) {
          setPendingAction(null)
          updateSnapshot({ busy: false })
        }
      }
    },
    [applyStatus, browserId, busy, updateSnapshot],
  )

  const pausedBridgeServers = useWebMcpBrowserValue((state) => state.pausedBridgeServers, key)

  const ready = phase === "ready" && Boolean(browserId)
  const canEnable = ready && nativeAvailable && runtimeCompatible !== false
  const enableRequests = useWebMcpBrowserValue((state) => state.enableRequests, key)
  const enableConsumed = useWebMcpBrowserValue((state) => state.enableConsumed, key)
  const consumeEnableRequest = React.useCallback(
    () => useWebMcpBrowserStore.getState().consumeEnableRequest(key),
    [key],
  )
  const hasPendingEnableRequest = enableRequests > enableConsumed
  React.useEffect(() => {
    if (paused || enabled || interrupted) {
      consumeEnableRequest()
      return
    }
    if (!canEnable || !sessionID || busy || !hasPendingEnableRequest) return
    // Bounds reach the native view a frame after the browser reports ready; give it that frame.
    // The request is consumed as the command goes out, not when this timer is armed: a dependency
    // that changed inside the window used to cancel the timer and leave the request consumed, so
    // the user's "enable" never reached the browser and nothing armed another attempt.
    const timer = window.setTimeout(() => {
      if (!consumeEnableRequest()) return
      void command("enable")
    }, 150)
    return () => window.clearTimeout(timer)
  }, [
    busy,
    sessionID,
    paused,
    canEnable,
    command,
    consumeEnableRequest,
    enabled,
    interrupted,
    enableConsumed,
    enableRequests,
    hasPendingEnableRequest,
  ])
  const error = useWebMcpBrowserValue((state) => state.error, key)
  const showErrorBanner = error !== null && error !== "session-required"
  const fixAction = webMcpErrorAction(error)
  const fixError = () => {
    if (fixAction === "address") addressRef.current?.focus()
    else if (fixAction === "reopen") {
      void (browserId ? invoke({ action: "close", id: browserId }) : Promise.resolve())
        .catch(() => {})
        .then(() => setRestart((value) => value + 1))
    } else void command(fixAction === "enable" && paused ? "resume" : fixAction)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <WebMcpPageSwitcher
        selectedKey={key}
        onRetry={() => {
          if (poolFull) setRestart((value) => value + 1)
        }}
      />
      {poolFull && (
        <p role="alert" className="p-2 typography-meta">
          {t(otherWindows?.length ? "webmcp.pages.fullOtherWindows" : "webmcp.pages.blocked")}
          <Button type="button" size="xs" variant="outline" onClick={() => setRestart((value) => value + 1)}>
            {t("webmcp.actions.fix.reopen")}
          </Button>
        </p>
      )}
      <WebMcpTrustSummary viewKey={key} />
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
          <span className="whitespace-nowrap typography-meta font-medium text-foreground">{summary.stateLabel}</span>
          <span className="typography-micro truncate text-muted-foreground" title={summary.detail}>
            {summary.detail}
          </span>
        </div>
        {paused || enabled || interrupted ? (
          <>
            <Button
              ref={accessControlRef}
              type="button"
              size="xs"
              disabled={!ready || busy}
              onClick={() => void command(paused ? "resume" : "pause")}
            >
              {t(paused ? "webmcp.actions.resumeAgent" : "webmcp.actions.pauseAgent")}
            </Button>
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={!ready || busy}
              onClick={() => void command("disconnect")}
            >
              {t("webmcp.actions.disconnect")}
            </Button>
          </>
        ) : showErrorBanner ? null : sessionID && ready && !origin ? (
          <Button ref={accessControlRef} type="button" size="xs" onClick={() => addressRef.current?.focus()}>
            {t("webmcp.actions.fix.address")}
          </Button>
        ) : !sessionID ? (
          <Button type="button" size="xs" onClick={() => openProjectBrowser({ enable: true })}>
            {t("webmcp.actions.startSession")}
          </Button>
        ) : (
          <Button
            ref={accessControlRef}
            type="button"
            size="xs"
            disabled={!canEnable || busy}
            onClick={() => void command("enable")}
          >
            {pendingAction === "enable" ? t("webmcp.actions.enabling") : t("webmcp.actions.enable")}
          </Button>
        )}
      </div>

      <div role="status" aria-live="polite" aria-atomic="true" data-webmcp-access-status>
        {interrupted ? <p className="px-2.5 py-1.5 typography-micro">{t("webmcp.detail.interrupted")}</p> : null}
        {paused ? <p className="px-2.5 py-1.5 typography-micro">{t("webmcp.browser.takeOver")}</p> : null}
        {waiting ? (
          <p className="px-2.5 py-1.5 typography-micro">
            {t(paused ? "webmcp.browser.waitingForResume" : "webmcp.browser.waitingForPage")}
          </p>
        ) : null}
        {stoppedCalls > 0 ? (
          <p className="px-2.5 py-1.5 typography-micro">
            {t(stoppedCalls === 1 ? "webmcp.browser.stoppedCall" : "webmcp.browser.stoppedCalls", {
              count: stoppedCalls,
            })}
          </p>
        ) : null}
      </div>
      {!enabled && !paused && !interrupted && ready ? (
        <p className="border-b border-border/40 px-2.5 py-1.5 typography-micro text-muted-foreground">
          {t("webmcp.browser.explanation")}
        </p>
      ) : null}
      {enabled && ready && !origin ? (
        <p className="border-b border-border/40 px-2.5 py-1.5 typography-micro text-muted-foreground">
          {t("webmcp.browser.openPageHint")}
        </p>
      ) : null}
      {enabled && pausedBridgeServers.length > 0 ? (
        <p className="border-b border-border/40 px-2.5 py-1.5 typography-micro text-muted-foreground">
          {t("webmcp.detail.bridgePaused", { servers: pausedBridgeServers.join(", ") })}
        </p>
      ) : null}

      {showErrorBanner && !poolFull ? (
        <p
          role="alert"
          className="flex items-start gap-2 border-b border-border/40 bg-[color-mix(in_srgb,var(--status-error)_10%,transparent)] px-2.5 py-1.5 typography-micro text-foreground"
        >
          <Icon name="error-warning" className="mt-px h-3.5 w-3.5 shrink-0 text-[var(--status-error)]" />
          <span>{t(describeWebMcpError(error))}</span>
          <Button type="button" size="xs" variant="outline" disabled={busy} onClick={fixError}>
            {t(`webmcp.actions.fix.${fixAction}`)}
          </Button>
        </p>
      ) : null}

      {sessionID ? <WebMcpCallStrip sessionID={sessionID} directory={directory} /> : null}
      {browserId ? (
        <WebMcpToolPanel
          key={key}
          viewKey={key}
          tryTool={(toolName, input) =>
            invoke<{ ok: boolean; outcome?: string; output?: unknown; reason?: string }>({
              action: "tryTool",
              id: browserId,
              toolName,
              input,
            })
          }
        />
      ) : null}
      {browserId ? <WebMcpBuilderHint viewKey={key} /> : null}

      {/* The page itself is a native view over this box; the region names it so assistive technology announces the boundary. */}
      <div
        ref={host}
        role="region"
        aria-label={origin ? t("webmcp.browser.pageRegion", { origin }) : t("webmcp.browser.pageRegionEmpty")}
        className="relative min-h-0 flex-1 bg-background"
      >
        {!browserId ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <Icon name="ax-browser" className="h-8 w-8 text-muted-foreground/60" />
            {!showErrorBanner ? (
              <p className="typography-meta text-muted-foreground">
                {phase === "starting"
                  ? t("webmcp.detail.starting")
                  : sessionID
                    ? t("webmcp.detail.startFailed")
                    : t("webmcp.detail.sessionRequired")}
              </p>
            ) : null}
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
  const sessionID = useSessionUIStore((state) => state.currentSessionId)
  React.useLayoutEffect(() => {
    useWebMcpBrowserStore.getState().selectView(directory, sessionID)
  }, [directory, sessionID])
  const key = viewKeyFor(directory, sessionID)
  const agentModeRequests = useWebMcpBrowserValue((state) => state.agentModeRequests, key)
  const consumeAgentModeRequest = React.useCallback(
    () => useWebMcpBrowserStore.getState().consumeAgentModeRequest(key),
    [key],
  )
  const openProjectBrowser = useOpenProjectBrowser()
  const summary = useWebMcpSummary(viewKeyFor(directory, sessionID))

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
          if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "Home" || event.key === "End") {
            event.preventDefault()
            // Two tabs: arrows switch to the other one; Home and End pick the first and last. Focus follows the
            // selection, so a keyboard or screen-reader user lands on the tab that is now active.
            const next = event.key === "Home" ? false : event.key === "End" ? true : !agentBrowser
            setAgentBrowser(next)
            event.currentTarget
              .querySelector<HTMLButtonElement>(`#webmcp-mode-tab-${next ? "agent" : "preview"}`)
              ?.focus()
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
        {!agentBrowser ? (
          <div className="ml-auto flex min-w-0 items-center gap-2 pl-2">
            <span className="hidden min-w-0 items-center gap-1.5 typography-micro text-muted-foreground sm:inline-flex">
              <WebMcpStatusDot tone={summary.tone} />
              <span className="truncate">WebMCP · {summary.stateLabel}</span>
            </span>
            <Button
              type="button"
              size="xs"
              variant="outline"
              className="gap-1"
              onClick={() => openProjectBrowser({ enable: true })}
              title={t("webmcp.browser.cta")}
            >
              <Icon name="global" className="h-3.5 w-3.5" />
              {t("webmcp.actions.enable")}
            </Button>
          </div>
        ) : null}
      </div>
      <div
        id="webmcp-mode-panel"
        role="tabpanel"
        aria-labelledby={agentBrowser ? "webmcp-mode-tab-agent" : "webmcp-mode-tab-preview"}
        className="relative min-h-0 flex-1"
      >
        {agentBrowser ? (
          <AgentBrowser directory={normalizeProjectPath(directory) ?? directory} initialUrl={initialUrl} />
        ) : (
          children
        )}
      </div>
    </div>
  )
}
