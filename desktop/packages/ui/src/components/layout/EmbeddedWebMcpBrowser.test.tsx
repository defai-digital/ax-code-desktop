import React, { act } from "react"
import { dict } from "@/lib/i18n/messages/en"
import { render as renderDom, cleanup, fireEvent, within } from "@/test/dom"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const invoke = vi.fn()

vi.doMock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      if (
        [
          "webmcp.actions.pauseAgent",
          "webmcp.actions.resumeAgent",
          "webmcp.browser.takeOver",
          "webmcp.browser.waitingForResume",
          "webmcp.browser.waitingForPage",
          "webmcp.browser.stoppedCall",
          "webmcp.browser.stoppedCalls",
          "webmcp.browser.stillFinishing",
          "webmcp.detail.ownedByAnotherWindow",
          "webmcp.actions.fix.focusOwner",
        ].includes(key)
      ) {
        return Object.entries(params ?? {}).reduce(
          (text, [name, value]) => text.replace(`{${name}}`, String(value)),
          dict[key as keyof typeof dict],
        )
      }
      return key
    },
  }),
}))
vi.doMock("@/lib/desktopBridge", () => ({ getDesktopBridge: () => ({ invoke }) }))
vi.doMock("@/lib/webMcpBridgeCoordination", () => ({
  pauseChromeBridgeForProjectBrowser: async () => [],
  resumeChromeBridgeForProjectBrowser: async () => {},
}))
vi.doMock("@/hooks/useWebMcpBrowser", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/hooks/useWebMcpBrowser")>()
  const { summarizeWebMcpBrowser } = await import("@/lib/webMcpSummary")
  return {
    ...original,
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
// The connected panel reads the transcript through sync. Render the plain panel so this journey stays provider-free.
vi.doMock("@/components/mcp/WebMcpToolPanelConnected", async () => {
  const React = await import("react")
  const panel = await import("@/components/mcp/WebMcpToolPanel")
  return {
    WebMcpToolPanelConnected: (props: {
      tryTool: (
        toolName: string,
        input: Record<string, unknown>,
      ) => Promise<{ ok: boolean; outcome?: string; output?: unknown; reason?: string }>
      viewKey?: string
    }) => React.createElement(panel.WebMcpToolPanel, { tryTool: props.tryTool, viewKey: props.viewKey }),
  }
})
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
      views: {},
      order: [],
      activeKey: null,
      capacity: null,
      interrupted: false,
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
      toolJournal: [],
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

  test("a cross-window full pool offers owner focus and a working reopen action", async () => {
    let full = true
    invoke.mockImplementation(async (_channel: string, call: { action?: string }) => {
      if (call.action === "create" && full) throw new Error("pool-full")
      if (call.action === "focusOwner") return { focused: true }
      return call.action === "bounds" ? undefined : browserStatus(false)
    })
    useWebMcpBrowserStore.setState({
      capacity: { liveViews: 2, maxLiveViews: 2, otherWindows: [{ id: "foreign-page", pageCount: 2 }] },
    })
    render()
    openAgentMode()
    await flush()
    expect(container.textContent).toContain("webmcp.pages.fullOtherWindows")
    expect(container.textContent).not.toContain("webmcp.pages.blocked")
    await act(async () => {
      within(container).getByRole("button", { name: "webmcp.pages.focusWindow" }).click()
    })
    expect(callsFor("focusOwner")[0][1]).toEqual({ action: "focusOwner", id: "foreign-page" })
    full = false
    await act(async () => {
      within(container).getByRole("button", { name: "webmcp.actions.fix.reopen" }).click()
    })
    expect(callsFor("create")).toHaveLength(2)
    expect(useWebMcpBrowserStore.getState().browserId).toBe("browser-1")
    expect(callsFor("enable")).toHaveLength(0)
    useWebMcpBrowserStore.setState({ capacity: null })
  })

  test("status polling reports interruption and automatic recovery while Disconnect remains available", async () => {
    let state = { ...browserStatus(true), interrupted: false }
    invoke.mockImplementation(async (_channel: string, call: { action?: string }) =>
      call.action === "bounds" ? undefined : state,
    )
    render()
    openAgentMode()
    await flush()
    state = { ...state, enabled: false, interrupted: true }
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(useWebMcpBrowserStore.getState()).toMatchObject({ enabled: false, interrupted: true })
    expect(container.textContent).toContain("webmcp.pages.access.interrupted")
    expect(container.textContent).not.toContain("webmcp.state.on")
    expect(within(container).getByRole("button", { name: "webmcp.actions.disconnect" })).toBeTruthy()
    state = { ...state, enabled: true, interrupted: false }
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(container.textContent).toContain("webmcp.state.on")
    expect(callsFor("enable")).toHaveLength(0)
    state = { ...state, enabled: false, interrupted: true }
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    invoke.mockImplementation(async (_channel: string, call: { action?: string }) => {
      if (call.action === "status") throw new Error("Browser gone")
      return undefined
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(useWebMcpBrowserStore.getState()).toMatchObject({ phase: "error", enabled: false, interrupted: false })
    expect(container.textContent).not.toContain("webmcp.pages.access.interrupted")
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

  test("clear feedback survives a create reply that arrives after its view was cleared", async () => {
    let finish!: (value: unknown) => void
    invoke.mockImplementation((_channel: string, call: { action?: string }) => {
      if (call.action === "list") return Promise.resolve({ views: [] })
      if (call.action === "create")
        return new Promise((resolve) => {
          finish = resolve
        })
      return Promise.reject(new Error("view already cleared"))
    })
    render()
    openAgentMode()
    await flush()
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent("openchamber:webmcp-storage", {
          detail: {
            views: [{ id: "browser-1", directory: "/repo", sessionID: "ses_one" }],
            error: "storage-cleared",
          },
        }),
      )
      finish(browserStatus(false))
    })
    expect(within(container).getByRole("alert").textContent).toContain("webmcp.detail.storageCleared")
    expect(useWebMcpBrowserStore.getState()).toMatchObject({ browserId: null, views: {}, order: [] })
  })

  test("a cleared pane shows storage feedback and ignores late status replies and failures", async () => {
    render()
    openAgentMode()
    await flush()
    let finish!: (value: unknown) => void
    invoke.mockImplementation((_channel: string, call: { action?: string }) =>
      call.action === "status"
        ? new Promise((resolve) => {
            finish = resolve
          })
        : Promise.resolve(browserStatus(false)),
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100)
    })
    const views = [{ id: "browser-1", directory: "/repo", sessionID: "ses_one" }]
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent("openchamber:webmcp-storage", { detail: { views, error: "storage-clearing" } }),
      )
      finish(browserStatus(true))
    })
    expect(within(container).getByRole("alert").textContent).toContain("webmcp.detail.storageClearing")
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent("openchamber:webmcp-storage", { detail: { views, error: "storage-cleared" } }),
      )
    })
    invoke.mockRejectedValue(new Error("closed"))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(within(container).getByRole("alert").textContent).toContain("webmcp.detail.storageCleared")
    expect(useWebMcpBrowserStore.getState()).toMatchObject({ browserId: null, enabled: false, views: {}, order: [] })
    expect(within(container).queryByText("webmcp.detail.disconnected")).toBeNull()
  })

  test("another window offers Focus without a looping Reopen or any owner mutation", async () => {
    invoke.mockImplementation(async (_channel, call) => {
      if (call.action === "list") return { views: [] }
      if (call.action === "create") return { error: "owned-by-another-window", ownerId: "owner-browser" }
      return { focused: true }
    })
    render()
    openAgentMode()
    await flush()
    expect(within(container).getByRole("alert").textContent).toContain(
      "This session's browser is open in another window",
    )
    const focus = within(container).getByRole("button", { name: "Focus that window" })
    fireEvent.click(focus)
    await flush()
    expect(callsFor("focusOwner")[0][1]).toEqual({ action: "focusOwner", id: "owner-browser" })
    expect(callsFor("create")).toHaveLength(1)
    expect(callsFor("show")).toHaveLength(0)
    expect(callsFor("close")).toHaveLength(0)
    expect(within(container).queryByRole("button", { name: "webmcp.actions.fix.reopen" })).toBeNull()
  })

  test("an unacknowledged stop says still finishing instead of stopped", async () => {
    invoke.mockImplementation(async (_channel, call) => ({
      ...browserStatus(call.action !== "pause"),
      paused: call.action === "pause",
      stoppedCalls: 0,
      finishingCalls: 1,
    }))
    render()
    openAgentMode()
    await flush()
    fireEvent.click(within(container).getByRole("button", { name: "Pause agent" }))
    await flush()
    expect(container.textContent).toContain("Stop requested for 1 call(s), still finishing")
    expect(container.textContent).not.toContain("Stopped 1 agent call")
  })

  test.each(["pause", "disconnect"])(
    "acknowledges %s cancellation without claiming rollback and restores keyboard focus",
    async (action) => {
      let state = { ...browserStatus(true), paused: false, waiting: false, stoppedCalls: 0 }
      invoke.mockImplementation(async (_channel: string, call: { action: string }) => {
        if (call.action === "pause" || call.action === "disconnect")
          state = { ...state, enabled: false, paused: call.action === "pause", stoppedCalls: 1 }
        if (call.action === "resume")
          state = { ...state, enabled: true, paused: false, waiting: false, stoppedCalls: 0 }
        return state
      })
      render()
      openAgentMode()
      await flush()
      const pause = within(container).getByRole("button", { name: "Pause agent" })
      const disconnect = within(container).getByRole("button", { name: "webmcp.actions.disconnect" })
      expect(pause.tabIndex).toBe(0)
      expect(disconnect.tabIndex).toBe(0)
      act(() => (action === "pause" ? pause : disconnect).focus())
      fireEvent.click(document.activeElement!)
      await flush()
      expect(callsFor(action)).toHaveLength(1)
      const feedback = container.querySelector<HTMLElement>("[data-webmcp-access-status]")!
      expect(feedback.textContent).toContain("Stopped 1 agent call. Changes it already made on the page stay.")
      expect(feedback.textContent).not.toMatch(/roll.?back|undone|reverted|restored/i)
      expect(document.activeElement).toBe(
        within(container).getByRole("button", { name: action === "pause" ? "Resume agent" : "webmcp.actions.enable" }),
      )
      expect(callsFor("navigate")).toHaveLength(0)
      expect(callsFor("close")).toHaveLength(0)
      if (action === "pause") {
        expect(feedback.textContent).toContain("You have control of the page. The agent's calls wait until you resume.")
        state = { ...state, waiting: true }
        await act(async () => {
          await vi.advanceTimersByTimeAsync(1100)
        })
        expect(feedback.textContent).toContain("Agent call waiting for you to resume.")
        fireEvent.click(within(container).getByRole("button", { name: "Resume agent" }))
        await flush()
        expect(document.activeElement).toBe(within(container).getByRole("button", { name: "Pause agent" }))
        expect(feedback.textContent).toBe("")
        expect(callsFor("resume")).toHaveLength(1)
      }
    },
  )

  test("waits for cancellation acknowledgement and does not steal focus from a person typing", async () => {
    invoke.mockResolvedValue(browserStatus(true))
    render()
    openAgentMode()
    await flush()
    let finish!: (value: unknown) => void
    invoke.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const pause = within(container).getByRole("button", { name: "Pause agent" })
    act(() => pause.focus())
    fireEvent.click(pause)
    expect(container.querySelector<HTMLElement>("[data-webmcp-access-status]")!.textContent).not.toContain("Stopped")
    const address = within(container).getByLabelText("webmcp.browser.addressAria")
    act(() => address.focus())
    await act(async () => {
      finish({ ...browserStatus(false), paused: true, stoppedCalls: 1 })
    })
    expect(container.querySelector<HTMLElement>("[data-webmcp-access-status]")!.textContent).toContain(
      "Stopped 1 agent call.",
    )
    expect(document.activeElement).toBe(address)
  })

  test("failed cancellation never shows a successful acknowledgement", async () => {
    invoke.mockResolvedValue(browserStatus(true))
    render()
    openAgentMode()
    await flush()
    invoke.mockRejectedValueOnce(new Error("IPC failed"))
    fireEvent.click(within(container).getByRole("button", { name: "Pause agent" }))
    await flush()
    expect(within(container).getByRole("alert").textContent).toContain("webmcp.detail.operationFailed")
    expect(container.querySelector<HTMLElement>("[data-webmcp-access-status]")!.textContent).not.toContain("Stopped")
    expect(within(container).getByRole("button", { name: "Pause agent" })).toBeTruthy()
  })

  test.each([0, 2])("reports only actual in-flight cancellation counts: %s", async (count) => {
    invoke.mockImplementation(async (_channel: string, call: { action: string }) => ({
      ...browserStatus(call.action !== "pause"),
      paused: call.action === "pause",
      stoppedCalls: count,
    }))
    render()
    openAgentMode()
    await flush()
    fireEvent.click(within(container).getByRole("button", { name: "Pause agent" }))
    await flush()
    const feedback = container.querySelector<HTMLElement>("[data-webmcp-access-status]")!.textContent
    if (count === 0) expect(feedback).not.toContain("Stopped")
    else expect(feedback).toContain("Stopped 2 agent calls. Changes they already made on the page stay.")
  })

  test("keeps Pause and Disconnect reachable when an enrolled page reports an error", async () => {
    invoke.mockImplementation(async () => ({ ...browserStatus(true), error: "ERR_ABORTED" }))
    render()
    openAgentMode()
    await flush()
    expect(within(container).getByRole("button", { name: "Pause agent" }).tabIndex).toBe(0)
    expect(within(container).getByRole("button", { name: "webmcp.actions.disconnect" }).tabIndex).toBe(0)
  })

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
    fireEvent.click(
      within(container).getByRole("button", {
        name: action === "resume" ? "Resume agent" : `webmcp.actions.${action}`,
      }),
    )
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
    fireEvent.click(within(container).getByRole("button", { name: "Resume agent" }))
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
  test("reuses pooled session pages and enrollment on return, hiding instead of closing them", async () => {
    const pages = new Map<
      string,
      ReturnType<typeof browserStatus> & { sessionID: string; directory: string; url: string }
    >()
    invoke.mockImplementation(
      async (_channel: string, call: { action: string; id?: string; sessionID?: string; url?: string }) => {
        if (call.action === "list") return { views: [...pages.values()] }
        if (call.action === "create") {
          const sessionID = call.sessionID!
          if (!pages.has(sessionID))
            pages.set(sessionID, {
              ...browserStatus(false),
              id: `view-${sessionID}`,
              sessionID,
              directory: "/repo",
              url: call.url!,
            })
          return pages.get(sessionID)
        }
        const page = [...pages.values()].find((page) => page.id === call.id)
        if (call.action === "enable" && page) page.enabled = true
        return page
      },
    )
    render()
    openAgentMode()
    await flush()
    act(() => useWebMcpBrowserStore.getState().requestAgentMode({ enable: true }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })
    expect(callsFor("enable")).toHaveLength(1)
    act(() => useSessionUIStore.setState({ currentSessionId: "ses_two" }))
    await flush()
    expect(useWebMcpBrowserStore.getState().browserId).toBe("view-ses_two")
    expect(useWebMcpBrowserStore.getState().enabled).toBe(false)
    act(() => useSessionUIStore.setState({ currentSessionId: "ses_one" }))
    await flush()
    expect(useWebMcpBrowserStore.getState()).toMatchObject({ browserId: "view-ses_one", enabled: true })
    expect(pages.size).toBe(2)
    expect(callsFor("close")).toHaveLength(0)
    expect(callsFor("enable")).toHaveLength(1)
    expect(callsFor("show")).toHaveLength(3)
  })
})
