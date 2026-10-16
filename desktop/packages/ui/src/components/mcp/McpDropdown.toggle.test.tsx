import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"
import { dict } from "@/lib/i18n/messages/en"

const { connect, disconnect, toastError } = vi.hoisted(() => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  toastError: vi.fn(),
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
    getStatusForDirectory: () => ({ files: { status: "connected" } }),
    refresh: vi.fn(async () => {}),
    connect,
    disconnect,
  }),
}))
vi.mock("@/stores/useMcpConfigStore", () => ({
  useMcpConfigStore: stubStore({
    mcpServers: [{ name: "files", scope: "project" }],
    loadMcpConfigs: vi.fn(async () => {}),
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
})
