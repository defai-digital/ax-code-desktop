import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const invoke = vi.fn()

vi.doMock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.doMock("@/lib/desktopBridge", () => ({ getDesktopBridge: () => ({ invoke }) }))
vi.doMock("@/lib/webMcpBridgeCoordination", () => ({
  pauseChromeBridgeForProjectBrowser: async () => [],
  resumeChromeBridgeForProjectBrowser: async () => {},
}))
vi.doMock("@/hooks/useWebMcpBrowser", () => ({
  useWebMcpCapabilityProbe: () => {},
  useWebMcpSummary: () => ({
    tone: "neutral",
    stateKey: "webmcp.state.off",
    detailKey: "webmcp.detail.off",
    canOpen: false,
    stateLabel: "off",
    detail: "off",
  }),
  useOpenProjectBrowser: () => () => {},
}))
vi.doMock("@/components/mcp/WebMcpBrowserTools", () => ({ WebMcpStatusDot: () => null }))

const { EmbeddedBrowserChoice } = await import("./EmbeddedWebMcpBrowser")
const { useWebMcpBrowserStore } = await import("@/stores/useWebMcpBrowserStore")
const { useSessionUIStore } = await import("@/sync/session-ui-store")

const browserStatus = (enabled: boolean) => ({
  id: "browser-1",
  nativeAvailable: true,
  enabled,
  origin: "https://example.test",
  tools: enabled ? 3 : 0,
})

describe("agent browser enable request", () => {
  let container: HTMLDivElement
  let root: Root

  const render = () =>
    act(() =>
      root.render(
        <EmbeddedBrowserChoice directory="/repo" initialUrl="https://example.test">
          <div />
        </EmbeddedBrowserChoice>,
      ),
    )

  const openPreviewMode = () =>
    act(() => {
      container.querySelector<HTMLButtonElement>("#webmcp-mode-tab-preview")?.click()
    })

  const openAgentMode = () =>
    act(() => {
      container.querySelector<HTMLButtonElement>("#webmcp-mode-tab-agent")?.click()
    })

  const flush = () => act(async () => {})

  const callsFor = (action: string) =>
    invoke.mock.calls.filter((call) => (call[1] as { action?: string } | undefined)?.action === action)

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    Object.defineProperty(Element.prototype, "checkVisibility", { configurable: true, value: () => true })
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

    invoke.mockReset()
    invoke.mockImplementation(async (_channel: string, call: { action?: string }) =>
      call?.action === "close" || call?.action === "bounds" ? undefined : browserStatus(call?.action === "enable"),
    )
    useWebMcpBrowserStore.setState({
      phase: "idle",
      browserId: null,
      enabled: false,
      busy: false,
      nativeAvailable: false,
      runtimeCompatible: true,
      agentModeRequests: 0,
      agentModeConsumed: 0,
      enableRequests: 0,
      enableConsumed: 0,
    })
    useSessionUIStore.setState({ currentSessionId: "session-1" })

    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    document.body.replaceChildren()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  })

  test("enables agent access once the browser reports ready", async () => {
    render()
    openAgentMode()
    await flush()

    act(() => useWebMcpBrowserStore.getState().requestAgentMode({ enable: true }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })

    expect(callsFor("enable")).toHaveLength(1)
  })

  test("ignores a command reply that lands after the pane unmounted", async () => {
    // The cleanup closes the native view and resets the store, and the lifecycle it retired has to
    // keep a late reply from writing `phase: "ready"` and the closed browser id back.
    render()
    openAgentMode()
    await flush()

    let resolveNavigate: ((value: unknown) => void) | undefined
    invoke.mockImplementationOnce(async () => new Promise((resolve) => {
      resolveNavigate = resolve
    }))
    act(() => {
      const form = container.querySelector("form")
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })
    await flush()

    // Switching back to the preview tab unmounts the agent pane: it closes the native view and
    // resets the snapshot.
    openPreviewMode()
    expect(useWebMcpBrowserStore.getState().browserId).toBeNull()

    await act(async () => {
      resolveNavigate?.(browserStatus(true))
      await Promise.resolve()
    })

    expect(useWebMcpBrowserStore.getState().phase).toBe("idle")
    expect(useWebMcpBrowserStore.getState().browserId ?? null).toBeNull()
  })

  test("hides the native view behind a dialog that carries no aria-modal", async () => {
    // The app's dialogs are Base UI popups: they carry `role="dialog"` and no `aria-modal`, while the hidden test
    // looked for `[role="dialog"][aria-modal="true"]` or a native `dialog[open]` — so the native view stayed on top
    // of the settings window, the command palette or a confirm dialog, and every click inside its rectangle went to
    // the embedded page instead of the dialog.
    const box = { x: 5, y: 5, width: 100, height: 100, top: 5, left: 5, right: 105, bottom: 105, toJSON: () => box }
    Object.defineProperty(Element.prototype, "getBoundingClientRect", { configurable: true, value: () => box })

    render()
    openAgentMode()
    await flush()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50)
    })

    const lastBounds = () => callsFor("bounds").at(-1)?.[1] as { width?: number; height?: number } | undefined
    expect(lastBounds()?.width).toBe(100)

    const dialog = document.createElement("div")
    dialog.setAttribute("role", "dialog")
    act(() => {
      document.body.appendChild(dialog)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50)
    })

    expect(lastBounds()?.width).toBe(0)
    expect(lastBounds()?.height).toBe(0)
  })

  test("still enables after a dependency changes inside the delay", async () => {
    // The request used to be consumed when the timer was armed, so a `busy` flip in the 150 ms
    // window cancelled the timer and left the request consumed: the user's enable never landed.
    render()
    openAgentMode()
    await flush()

    act(() => useWebMcpBrowserStore.getState().requestAgentMode({ enable: true }))
    act(() => useWebMcpBrowserStore.setState({ busy: true }))
    act(() => useWebMcpBrowserStore.setState({ busy: false }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })

    expect(callsFor("enable")).toHaveLength(1)
  })
})
