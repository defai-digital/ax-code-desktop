import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"
import { dict } from "@/lib/i18n/messages/en"

const { connect, disconnect, toastError, configState, statusState } = vi.hoisted(() => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  toastError: vi.fn(),
  // Mutable: a test can put two servers in the list and control both switches.
  configState: { mcpServers: [] as Array<{ name: string; scope: string }>, loadMcpConfigs: vi.fn(async () => {}) },
  statusState: { current: {} as Record<string, { status: string }> },
}))

vi.mock("@/components/ui", () => ({
  toast: { error: toastError, success: vi.fn(), message: vi.fn(), warning: vi.fn() },
}))
vi.mock("@/components/mcp/WebMcpToolsRow", () => ({ WebMcpToolsRow: () => null }))

const stubStore = <State,>(state: State) => {
  const useStore = ((selector?: (value: State) => unknown) => (selector ? selector(state) : state)) as unknown as {
    (selector?: (value: State) => unknown): unknown
    getState: () => State
    subscribe: (listener: () => void) => () => void
  }
  useStore.getState = () => state
  // The stores under test are subscribed to at module scope by their real collaborators.
  useStore.subscribe = () => () => {}
  return useStore
}

vi.mock("@/stores/useDirectoryStore", () => ({
  useDirectoryStore: stubStore({ currentDirectory: "/repo" }),
}))
vi.mock("@/stores/useMcpStore", () => ({
  useMcpStore: stubStore({
    getStatusForDirectory: () => statusState.current,
    refresh: vi.fn(async () => {}),
    connect,
    disconnect,
  }),
}))
vi.mock("@/stores/useMcpConfigStore", () => ({
  useMcpConfigStore: stubStore({
    get mcpServers() {
      return configState.mcpServers
    },
    get loadMcpConfigs() {
      return configState.loadMcpConfigs
    },
  }),
}))

const { McpDropdownContent } = await import("./McpDropdown")

describe("McpDropdownContent server toggles", () => {
  let container: HTMLDivElement
  let root: Root
  let unhandled: unknown[]

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    connect.mockReset()
    disconnect.mockReset()
    toastError.mockReset()
    configState.mcpServers = [{ name: "files", scope: "project" }]
    statusState.current = { files: { status: "connected" } }
    unhandled = []
    process.on("unhandledRejection", (reason) => unhandled.push(reason))
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    process.removeAllListeners("unhandledRejection")
    vi.restoreAllMocks()
  })

  const render = async () => {
    await act(async () => {
      root.render(
        <I18nProvider>
          <McpDropdownContent active onOpenProjectBrowser={() => {}} />
        </I18nProvider>,
      )
    })
    await act(async () => {})
  }

  const toggle = async () => {
    const toggleSwitch = container.querySelector<HTMLElement>('[role="switch"]')
    if (!toggleSwitch) throw new Error("server switch not found")
    await act(async () => {
      toggleSwitch.click()
    })
    await act(async () => {})
  }

  // `connect` re-throws and `disconnect` asks for errors, and the dropdown is the only caller that
  // reads neither the diagnostics the store records nor the Settings page that shows them: the switch
  // used to snap back in silence while the rejection escaped the handler.
  test("reports a refused disconnect instead of snapping back in silence", async () => {
    disconnect.mockRejectedValue(new Error("server did not stop"))
    await render()

    await toggle()

    expect(disconnect).toHaveBeenCalled()
    expect(toastError).toHaveBeenCalledWith(
      dict["mcpDropdown.status.failed"].replace("{error}", "server did not stop"),
    )
    expect(unhandled).toEqual([])
  })

  test("keeps each switch disabled for its own request, not for the last one toggled", async () => {
    // One busy slot held a single server name: toggling a second server re-enabled the first one's
    // switch while its call was still in flight (a second click then issued a concurrent call for
    // it), and the first handler's `finally` re-enabled the second's the same way.
    const pending: Array<{ resolve: () => void }> = []
    connect.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          pending.push({ resolve: () => resolve() })
        }),
    )
    configState.mcpServers = [
      { name: "alpha", scope: "project" },
      { name: "beta", scope: "project" },
    ]
    statusState.current = { alpha: { status: "failed" }, beta: { status: "failed" } }
    await render()

    const switches = () => Array.from(container.querySelectorAll<HTMLElement>('[role="switch"]'))
    expect(switches()).toHaveLength(2)

    await act(async () => {
      switches()[0].click()
    })
    await act(async () => {})
    expect(switches()[0].getAttribute("aria-disabled")).toBe("true")

    await act(async () => {
      switches()[1].click()
    })
    await act(async () => {})
    expect(connect).toHaveBeenCalledTimes(2)
    // Both are pending, so both stay disabled.
    expect(switches()[0].getAttribute("aria-disabled")).toBe("true")
    expect(switches()[1].getAttribute("aria-disabled")).toBe("true")

    // The first request finishing must not re-enable the second.
    await act(async () => {
      pending[0]?.resolve()
    })
    await act(async () => {})
    expect(switches()[0].getAttribute("aria-disabled")).not.toBe("true")
    expect(switches()[1].getAttribute("aria-disabled")).toBe("true")

    await act(async () => {
      pending[1]?.resolve()
    })
    await act(async () => {})
  })
})
