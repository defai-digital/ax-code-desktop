import React, { act } from "react"
import { render as renderDom, cleanup, fireEvent, within } from "@/test/dom"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const invoke = vi.fn()

vi.doMock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.doMock("@/lib/desktopBridge", () => ({ getDesktopBridge: () => ({ invoke }) }))
vi.doMock("@/lib/webMcpBridgeCoordination", () => ({
  pauseChromeBridgeForProjectBrowser: async () => [],
  resumeChromeBridgeForProjectBrowser: async () => {},
}))
vi.doMock("@/hooks/useWebMcpBrowser", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/hooks/useWebMcpBrowser")>()
  const { summarizeWebMcpBrowser } = await import("@/lib/webMcpSummary")
  return {
    useWebMcpCapabilityProbe: () => {},
    useWebMcpSummary: () => {
      const state = useWebMcpBrowserStore()
      const summary = summarizeWebMcpBrowser(state, { isElectron: true })
      return { ...summary, stateLabel: summary.stateKey, detail: summary.detailKey }
    },
    useOpenProjectBrowser: original.useOpenProjectBrowser,
  }
})
vi.doMock("@/components/mcp/WebMcpBrowserTools", () => ({ WebMcpStatusDot: () => null }))
// The call strip reads the session transcript from sync state; it has its own tests.
vi.doMock("@/components/mcp/WebMcpCallStrip", () => ({ WebMcpCallStrip: () => null }))
vi.doMock("@/components/mcp/WebMcpBuilderHint", () => ({ WebMcpBuilderHint: () => null }))

const { EmbeddedBrowserChoice } = await import("./EmbeddedWebMcpBrowser")
const { useWebMcpBrowserStore } = await import("@/stores/useWebMcpBrowserStore")
const { useSessionUIStore } = await import("@/sync/session-ui-store")

const sessionSnapshot = useSessionUIStore.getState()

const browserStatus = (enabled: boolean) => ({
  error: null,
  id: "browser-1",
  nativeAvailable: true,
  enabled,
  origin: "https://example.test",
  tools: enabled ? 3 : 0,
})

describe("agent browser enable request", () => {
  let container: HTMLDivElement

  const render = () => {
    container = renderDom(
      <EmbeddedBrowserChoice directory="/repo" initialUrl="https://example.test">
        <div />
      </EmbeddedBrowserChoice>,
    ).container
  }

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
      paused: false,
      error: null,
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
    useSessionUIStore.setState({ currentSessionId: "ses_one" })

    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    useSessionUIStore.setState(sessionSnapshot, true)
    document.body.replaceChildren()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  })

  test.each(["empty", "reject"])(
    "retires tab Enable after a %s session start and never enables a later session",
    async (failure) => {
      const createSession = vi.fn(async () => {
        if (failure === "reject") throw new Error("session start failed")
        return null
      })
      useSessionUIStore.setState({
        currentSessionId: null,
        newSessionDraft: { ...sessionSnapshot.newSessionDraft, open: true, directoryOverride: "/repo" },
        createSession: createSession as unknown as typeof sessionSnapshot.createSession,
      })
      render()
      fireEvent.click(within(container).getByRole("button", { name: "webmcp.actions.enable" }))
      await flush()
      expect(createSession).toHaveBeenCalledWith("webmcp.session.title", "/repo")
      expect(callsFor("create")).toHaveLength(1)
      expect(useWebMcpBrowserStore.getState().enableRequests).toBe(1)
      expect(useWebMcpBrowserStore.getState().enableConsumed).toBe(1)
      act(() => useSessionUIStore.setState({ currentSessionId: "ses_unrelated" }))
      await flush()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1200)
      })
      expect(callsFor("enable")).toHaveLength(0)
    },
  )

  test("clears a stale native load error when the main process reports a healthy page", async () => {
    render()
    openAgentMode()
    await flush()
    act(() => useWebMcpBrowserStore.setState({ error: "ERR_ABORTED" }))
    expect(within(container).getByRole("alert").textContent).toContain("webmcp.detail.aborted")
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100)
    })
    expect(useWebMcpBrowserStore.getState().error).toBeNull()
    expect(within(container).queryByRole("alert")).toBeNull()
  })

  test("keeps a local command transport failure across healthy status polls", async () => {
    render()
    openAgentMode()
    await flush()
    invoke.mockImplementation(async (_channel: string, call: { action?: string }) => {
      if (call.action === "navigate") throw new Error("IPC unavailable")
      return browserStatus(false)
    })
    fireEvent.click(within(container).getByRole("button", { name: "webmcp.browser.go" }))
    await flush()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100)
    })
    expect(useWebMcpBrowserStore.getState().error).toBe("operation-failed")
    invoke.mockImplementation(async () => browserStatus(false))
    fireEvent.click(within(container).getByRole("button", { name: "webmcp.browser.go" }))
    await flush()
    expect(useWebMcpBrowserStore.getState().error).toBeNull()
  })

  test.each(["enable", "resume"])("maps the main %s failure even with a cached compatible runtime", async (action) => {
    render()
    openAgentMode()
    await flush()
    act(() => useWebMcpBrowserStore.setState({ paused: action === "resume", runtimeCompatible: true }))
    invoke.mockImplementation(async (_channel: string, call: { action?: string }) =>
      call.action === action ? { ...browserStatus(false), reason: "runtime-incompatible" } : browserStatus(false),
    )
    fireEvent.click(within(container).getByRole("button", { name: `webmcp.actions.${action}` }))
    await flush()
    expect(callsFor(action)).toHaveLength(1)
    expect(useWebMcpBrowserStore.getState()).toMatchObject({ error: "runtime-incompatible", runtimeCompatible: false })
    expect(within(container).getByRole("alert").textContent).toContain("webmcp.detail.runtimeIncompatible")
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
    invoke.mockImplementationOnce(
      async () =>
        new Promise((resolve) => {
          resolveNavigate = resolve
        }),
    )
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
  test("offers one draft enable action and Go navigates without enabling", async () => {
    useSessionUIStore.setState({ currentSessionId: null })
    render()
    openAgentMode()
    await flush()
    const ui = within(container)
    expect(ui.getAllByRole("button", { name: "webmcp.actions.startSession" })).toHaveLength(1)
    const go = ui.getByRole("button", { name: "webmcp.browser.go" }) as HTMLButtonElement
    expect(go.disabled).toBe(false)
    fireEvent.click(go)
    await flush()
    expect(callsFor("navigate")).toHaveLength(1)
    expect(callsFor("enable")).toHaveLength(0)
    expect(callsFor("create")[0][1]).toMatchObject({ sessionID: null })
  })

  test("restores session addresses with access off and isolates session switches", async () => {
    const { rememberWebMcpAddress } = await import("@/stores/useWebMcpBrowserStore")
    rememberWebMcpAddress("/repo/", "ses_one", "https://example.test/one")
    rememberWebMcpAddress("/repo", "ses_two", "https://example.test/two")
    render()
    openAgentMode()
    await flush()
    expect(callsFor("create").at(-1)?.[1]).toMatchObject({ url: "https://example.test/one" })
    act(() => useSessionUIStore.setState({ currentSessionId: "ses_two" }))
    await flush()
    expect(callsFor("create").at(-1)?.[1]).toMatchObject({ url: "https://example.test/two" })
    openPreviewMode()
    openAgentMode()
    await flush()
    expect(callsFor("create").at(-1)?.[1]).toMatchObject({ url: "https://example.test/two" })
    expect(callsFor("enable")).toHaveLength(0)
  })

  test("retires an old enable request while paused and resumes only on click", async () => {
    render()
    openAgentMode()
    await flush()
    act(() => {
      useWebMcpBrowserStore.setState({ paused: true, enabled: false })
      useWebMcpBrowserStore.getState().requestAgentMode({ enable: true })
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })
    expect(callsFor("enable")).toHaveLength(0)
    fireEvent.click(within(container).getByRole("button", { name: "webmcp.actions.resume" }))
    await flush()
    expect(callsFor("resume")).toHaveLength(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })
    expect(callsFor("enable")).toHaveLength(0)
    expect(callsFor("navigate")).toHaveLength(0)
  })

  test("shows the native reason and an address fix that never retries a request", async () => {
    render()
    openAgentMode()
    await flush()
    act(() => useWebMcpBrowserStore.setState({ error: "ERR_UNSAFE_PORT" }))
    expect(within(container).getByRole("alert").textContent).toContain("webmcp.detail.unsafePort")
    expect(within(container).getByTitle("webmcp.detail.unsafePort").textContent).toBe("webmcp.detail.unsafePort")
    fireEvent.click(within(container).getByRole("button", { name: "webmcp.actions.fix.address" }))
    expect(document.activeElement).toBe(within(container).getByLabelText("webmcp.browser.addressAria"))
    expect(callsFor("navigate")).toHaveLength(0)
    expect(callsFor("enable")).toHaveLength(0)
  })
  test("retires pending enable requests when switching sessions or closing the pane", async () => {
    render()
    openAgentMode()
    await flush()
    act(() => useWebMcpBrowserStore.getState().requestAgentMode({ enable: true }))
    act(() => useSessionUIStore.setState({ currentSessionId: "ses_two" }))
    await flush()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })
    expect(callsFor("enable")).toHaveLength(0)
    act(() => useWebMcpBrowserStore.getState().requestAgentMode({ enable: true }))
    openPreviewMode()
    openAgentMode()
    await flush()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })
    expect(callsFor("enable")).toHaveLength(0)
  })

  test("arrow, Home and End keys move focus with the selected browser mode, and the page area is a named region", async () => {
    render()
    await flush()
    const preview = container.querySelector<HTMLButtonElement>("#webmcp-mode-tab-preview")!
    const agent = container.querySelector<HTMLButtonElement>("#webmcp-mode-tab-agent")!
    const press = (key: string) =>
      act(() => {
        ;(document.activeElement ?? preview).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }))
      })
    act(() => preview.focus())
    press("ArrowRight")
    expect(agent.getAttribute("aria-selected")).toBe("true")
    expect(document.activeElement).toBe(agent)
    press("Home")
    expect(document.activeElement).toBe(preview)
    expect(preview.getAttribute("aria-selected")).toBe("true")
    press("End")
    expect(document.activeElement).toBe(agent)
    await flush()
    act(() => useWebMcpBrowserStore.setState({ origin: "https://shop.test" }))
    expect(within(container).getByRole("region", { name: "webmcp.browser.pageRegion" })).toBeTruthy()
  })

  test("offers exactly one next action for an empty page or an error", async () => {
    render()
    openAgentMode()
    await flush()
    act(() => useWebMcpBrowserStore.setState({ origin: null, page: "blank", error: null }))
    expect(within(container).getAllByRole("button", { name: "webmcp.actions.fix.address" })).toHaveLength(1)
    expect(within(container).getAllByRole("button", { name: "webmcp.actions.enable" })).toHaveLength(0)
    act(() => useWebMcpBrowserStore.setState({ error: "ERR_UNSAFE_PORT" }))
    expect(within(container).getAllByRole("button", { name: "webmcp.actions.fix.address" })).toHaveLength(1)
  })

  test("waits for a draft session before honoring its one explicit enable click", async () => {
    useSessionUIStore.setState({ currentSessionId: null })
    render()
    openAgentMode()
    await flush()
    act(() => useWebMcpBrowserStore.getState().requestAgentMode({ enable: true }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })
    expect(callsFor("enable")).toHaveLength(0)
    act(() => useSessionUIStore.setState({ currentSessionId: "ses_created" }))
    await flush()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })
    expect(callsFor("enable")).toHaveLength(1)
  })
  test("does not carry a draft page into another project", async () => {
    useSessionUIStore.setState({ currentSessionId: null })
    invoke.mockImplementation(async () => ({ ...browserStatus(false), url: "https://draft.test/one" }))
    const mounted = renderDom(
      <EmbeddedBrowserChoice directory="/one" initialUrl="https://one.test">
        <div />
      </EmbeddedBrowserChoice>,
    )
    container = mounted.container
    openAgentMode()
    await flush()
    invoke.mockImplementation(async () => browserStatus(false))
    mounted.rerender(
      <EmbeddedBrowserChoice directory="/two" initialUrl="https://two.test">
        <div />
      </EmbeddedBrowserChoice>,
    )
    await flush()
    expect(callsFor("create").at(-1)?.[1]).toMatchObject({ directory: "/two", url: "https://two.test" })
    expect(callsFor("enable")).toHaveLength(0)
  })
})
