import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { OpenChamberProjectAction } from "@/lib/openchamberConfig"
import type { TerminalStreamEvent } from "@/lib/api/types"

const mocks = vi.hoisted(() => ({
  terminal: { createSession: vi.fn(), sendInput: vi.fn(), close: vi.fn(), forceKill: vi.fn() },
  mobile: true,
  config: vi.fn(),
  save: vi.fn(),
  output: vi.fn(),
  connect: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
}))
vi.mock("@/hooks/useRuntimeAPIs", () => ({ useRuntimeAPIs: () => ({ terminal: mocks.terminal }) }))
vi.mock("@/lib/device", () => ({ useDeviceInfo: () => ({ isMobile: mocks.mobile }) }))
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock("@/components/ui", () => ({ toast: { error: mocks.error, success: mocks.success } }))
vi.mock("@/lib/openchamberConfig", () => ({
  getProjectActionsState: mocks.config,
  saveProjectActionsState: mocks.save,
}))
vi.mock("@/lib/terminalApi", () => ({
  getTerminalSessionOutput: mocks.output,
  connectTerminalStream: mocks.connect,
  terminalStreamConsumerKey: (dir: string, tab: string) => `${dir}:${tab}`,
}))
import { ProjectActionsButton } from "./ProjectActionsButton"
import { useUIStore } from "@/stores/useUIStore"
import { useTerminalStore } from "@/stores/useTerminalStore"
import { toProjectActionRunKey } from "@/lib/projectActions"
import { useSessionUIStore } from "@/sync/session-ui-store"

describe("project action preview lifecycle", () => {
  let root: Root
  let container: HTMLDivElement
  let output: (event: TerminalStreamEvent) => void
  let streamError: (error: Error, fatal: boolean) => void
  let action: OpenChamberProjectAction
  const openPreview = vi.fn()
  const project = { id: "fixture", path: "/fixture" }
  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetAllMocks()
    mocks.mobile = true
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    action = {
      id: "server",
      name: "Start server",
      command: "python3 app.py",
      shell: "posix",
      autoOpenUrl: true,
      waitForUrl: true,
      openUrl: "http://127.0.0.1:8501/",
    }
    mocks.config.mockImplementation(async () => ({ actions: [action] }))
    mocks.save.mockResolvedValue(true)
    mocks.terminal.createSession.mockResolvedValue({ sessionId: "pty-fixture" })
    mocks.terminal.sendInput.mockResolvedValue(undefined)
    mocks.output.mockResolvedValue({ shell: "/bin/zsh", output: "", cwd: "/fixture" })
    mocks.connect.mockImplementation((_id, callback, onError) => {
      output = callback
      streamError = onError
      return vi.fn()
    })
    useTerminalStore.setState({ sessions: new Map(), projectActionRuns: {} })
    useSessionUIStore.setState({ currentSessionId: "analysis-session" })
    useUIStore.setState({ openContextPreview: openPreview })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })
  const render = async (directory = "/fixture") => {
    await act(async () => root.render(<ProjectActionsButton projectRef={project} directory={directory} allowMobile />))
  }
  const start = async () => {
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[aria-label="projectActions.actions.runNamedAria"]')!.click(),
    )
    await act(async () => vi.advanceTimersByTimeAsync(400))
  }

  test("remounted launcher records readiness without reopening the preview", async () => {
    await render()
    await start()
    const run = Object.values(useTerminalStore.getState().projectActionRuns)[0]!
    await act(async () => root.unmount())
    root = createRoot(container)
    await render()
    openPreview.mockClear()
    await act(async () =>
      output({
        type: "data",
        data: "URL: http://127.0.0.1:8501/\n",
      }),
    )
    expect(openPreview).not.toHaveBeenCalled()
    expect(useTerminalStore.getState().projectActionRuns[run.key].status).toBe("running")
  })

  test("retired assistant events are inert and no framework-specific control is offered", async () => {
    await render()
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent("ax-code:analysis-app-run", {
          cancelable: true,
          detail: {
            sessionId: "analysis-session",
            directory: "/fixture",
            artifact: { version: 1, kind: "streamlit", entrypoint: "app.py" },
          },
        }),
      )
    })
    expect(mocks.terminal.createSession).not.toHaveBeenCalled()
    expect(mocks.terminal.sendInput).not.toHaveBeenCalled()
    expect(container.textContent).not.toContain("Streamlit")
  })

  test("generic actions cancel when the originating session changes during terminal acquisition", async () => {
    let resolve!: (value: { sessionId: string }) => void
    mocks.terminal.createSession.mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    await render()
    await start()
    act(() => useSessionUIStore.setState({ currentSessionId: "another-session" }))
    await act(async () => resolve({ sessionId: "late-terminal" }))
    await act(async () => vi.advanceTimersByTimeAsync(400))
    expect(mocks.terminal.sendInput).not.toHaveBeenCalled()
    expect(openPreview).not.toHaveBeenCalled()
  })

  test("coalesces repeated discovery clicks and preserves the saved action's readiness contract", async () => {
    mocks.mobile = false
    let resolve!: (value: { sessionId: string }) => void
    mocks.terminal.createSession.mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    await render()
    await act(async () => {
      const button = container.querySelector<HTMLButtonElement>('[aria-label="projectActions.actions.runNamedAria"]')!
      button.click()
      button.click()
    })
    expect(mocks.terminal.createSession).toHaveBeenCalledTimes(1)
    await act(async () => resolve({ sessionId: "pty-fixture" }))
    await act(async () => vi.advanceTimersByTimeAsync(400))
    expect(mocks.terminal.sendInput).toHaveBeenCalledExactlyOnceWith("pty-fixture", `${action.command}\r`)
    expect(Object.values(useTerminalStore.getState().projectActionRuns)[0]?.actionId).toBe(action.id)
    await act(async () => output({ type: "data", data: "URL: http://127.0.0.1:8501/\n" }))
    expect(openPreview).toHaveBeenCalledExactlyOnceWith("/fixture", "http://127.0.0.1:8501/")
    await act(async () => output({ type: "exit", exitCode: 0 }))
    mocks.terminal.createSession.mockResolvedValue({ sessionId: "pty-retry" })
    await start()
    expect(mocks.terminal.sendInput).toHaveBeenCalledTimes(2)
  })

  test("waits for the matching startup URL and streams without a visible terminal", async () => {
    await render()
    await start()
    expect(mocks.terminal.sendInput).toHaveBeenCalledExactlyOnceWith("pty-fixture", `${action.command}\r`)
    expect(openPreview).not.toHaveBeenCalled()
    await act(async () => output({ type: "connected" }))
    expect(useTerminalStore.getState().getDirectoryState("/fixture")?.tabs[0]?.isConnecting).toBe(false)
    await act(async () => output({ type: "data", data: "Port 8501 is already in use\r\n" }))
    expect(openPreview).not.toHaveBeenCalled()
    await act(async () => output({ type: "data", data: "  URL: http://127.0.0.1:8501/\r\n" }))
    expect(openPreview).toHaveBeenCalledExactlyOnceWith("/fixture", "http://127.0.0.1:8501/")
  })

  test("a missing startup URL becomes a visible failure without opening an occupied port", async () => {
    await render()
    await start()
    await act(async () => vi.advanceTimersByTimeAsync(15000))
    expect(Object.values(useTerminalStore.getState().projectActionRuns)[0]?.status).toBe("preview-unavailable")
    expect(mocks.error).toHaveBeenCalledWith("projectActions.preview.unavailable")
    expect(container.querySelector('[title="projectActions.preview.unavailable"]')).not.toBeNull()
    expect(openPreview).not.toHaveBeenCalled()
  })

  test("does not reopen the previous project's preview when output arrives after switching", async () => {
    await render()
    await start()
    await render("/another")
    await act(async () => output({ type: "data", data: "URL: http://127.0.0.1:8501/\n" }))
    expect(openPreview).not.toHaveBeenCalled()
  })

  test("a reused POSIX terminal runs in its owning project after the user changed directory", async () => {
    mocks.output.mockResolvedValue({ shell: "/bin/zsh", cwd: "/another-project" })
    await render()
    await start()
    expect(mocks.terminal.sendInput).toHaveBeenCalledExactlyOnceWith(
      "pty-fixture",
      `(cd '/fixture' || exit 1\n${action.command}\n)\r`,
    )
  })

  test("rejects unsupported shells before sending a generated command", async () => {
    mocks.output.mockResolvedValue({ shell: "cmd.exe" })
    await render()
    await start()
    expect(mocks.terminal.sendInput).not.toHaveBeenCalled()
    expect(mocks.error).toHaveBeenCalledWith("projectActions.error.unsupportedRecipeShell")
    expect(openPreview).not.toHaveBeenCalled()
    expect(useTerminalStore.getState().getDirectoryState("/fixture")?.tabs[0]?.isConnecting).toBe(false)
  })

  test("failed shell lookup clears only the acquired terminal's connecting state", async () => {
    let reject!: (error: Error) => void
    mocks.output.mockReturnValue(
      new Promise((_resolve, onReject) => {
        reject = onReject
      }),
    )
    await render()
    await start()
    const tab = useTerminalStore.getState().getDirectoryState("/fixture")!.tabs[0]
    expect(tab.isConnecting).toBe(true)
    act(() => {
      useTerminalStore.getState().setTabSessionId("/fixture", tab.id, "replacement-session")
      useTerminalStore.getState().setConnecting("/fixture", tab.id, true)
    })
    await act(async () => reject(new Error("lookup failed")))
    expect(useTerminalStore.getState().getDirectoryState("/fixture")?.tabs[0]?.isConnecting).toBe(true)
    expect(mocks.terminal.sendInput).not.toHaveBeenCalled()
  })

  test("manual URL waits for acknowledgement and opens once after a successful send", async () => {
    action = { ...action, shell: undefined, waitForUrl: undefined }
    let resolve!: () => void
    mocks.terminal.sendInput.mockReturnValue(
      new Promise<void>((onResolve) => {
        resolve = onResolve
      }),
    )
    await render()
    await start()
    expect(openPreview).not.toHaveBeenCalled()
    await act(async () => resolve())
    expect(openPreview).toHaveBeenCalledExactlyOnceWith("/fixture", "http://127.0.0.1:8501/")
  })

  test.each(["connected", "exit", "retryable-error", "fatal-error"])(
    "ignores stale %s callbacks after the tab acquires a replacement session",
    async (event) => {
      mocks.output.mockReturnValue(new Promise(() => {}))
      await render()
      await start()
      const tab = useTerminalStore.getState().getDirectoryState("/fixture")!.tabs[0]
      act(() => {
        useTerminalStore.getState().setTabSessionId("/fixture", tab.id, "replacement-session")
        useTerminalStore.getState().setConnecting("/fixture", tab.id, true)
      })
      await act(async () => {
        if (event === "connected" || event === "exit") output({ type: event })
        else streamError(new Error("stale stream"), event === "fatal-error")
      })
      const current = useTerminalStore.getState().getDirectoryState("/fixture")!.tabs[0]
      expect(current.terminalSessionId).toBe("replacement-session")
      expect(current.isConnecting).toBe(true)
      expect(openPreview).not.toHaveBeenCalled()
    },
  )

  test("manual URL does not open after switching projects during input acknowledgement", async () => {
    action = { ...action, shell: undefined, waitForUrl: undefined }
    let resolve!: () => void
    mocks.terminal.sendInput.mockReturnValue(
      new Promise<void>((onResolve) => {
        resolve = onResolve
      }),
    )
    await render()
    await start()
    await render("/another")
    await act(async () => resolve())
    expect(openPreview).not.toHaveBeenCalled()
  })

  test("does not send into a replaced session or remove its new run after late shell lookup", async () => {
    let resolve!: (value: { shell: string }) => void
    mocks.output.mockReturnValue(
      new Promise((onResolve) => {
        resolve = onResolve
      }),
    )
    await render()
    await start()
    const tab = useTerminalStore.getState().getDirectoryState("/fixture")!.tabs[0]
    const key = toProjectActionRunKey("/fixture", action.id)
    act(() => {
      useTerminalStore.getState().setTabSessionId("/fixture", tab.id, "replacement-session")
      useTerminalStore.getState().setProjectActionRun({
        key,
        directory: "/fixture",
        actionId: action.id,
        tabId: tab.id,
        sessionId: "replacement-session",
        status: "running",
      })
    })
    await act(async () => resolve({ shell: "/bin/zsh" }))
    expect(mocks.terminal.sendInput).not.toHaveBeenCalled()
    expect(useTerminalStore.getState().projectActionRuns[key]?.sessionId).toBe("replacement-session")
  })

  test("unmount during input acknowledgement neither reopens preview nor stops its server", async () => {
    action = { ...action, shell: undefined, waitForUrl: undefined }
    let resolve!: () => void
    mocks.terminal.sendInput.mockReturnValue(
      new Promise<void>((onResolve) => {
        resolve = onResolve
      }),
    )
    await render()
    await start()
    act(() => root.render(null))
    await act(async () => resolve())
    expect(openPreview).not.toHaveBeenCalled()
    expect(mocks.terminal.close).not.toHaveBeenCalled()
    expect(mocks.terminal.forceKill).not.toHaveBeenCalled()
  })

  test("manual URLs open only after input succeeds and never after a failed send", async () => {
    action = { ...action, shell: undefined, waitForUrl: undefined }
    mocks.terminal.sendInput.mockRejectedValue(new Error("send failed"))
    await render()
    await start()
    expect(openPreview).not.toHaveBeenCalled()
    expect(useTerminalStore.getState().projectActionRuns).toEqual({})
  })
})
