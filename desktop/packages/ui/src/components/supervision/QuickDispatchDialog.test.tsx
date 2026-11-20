import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"
import { dict } from "@/lib/i18n/messages/en"
import { axCodeClient } from "@/lib/ax-code/client"
import { toast } from "@/components/ui"
import { useConfigStore } from "@/stores/useConfigStore"
import { useGitStore } from "@/stores/useGitStore"
import { useProjectsStore } from "@/stores/useProjectsStore"
import { useSupervisionStore } from "@/stores/useSupervisionStore"
import { useMessageQueueStore } from "@/stores/messageQueueStore"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { useWorkModeStore } from "@/stores/useWorkModeStore"
import { openSupervisedSession } from "@/lib/supervision/openSession"
import type { SupervisionRow } from "@/lib/supervision/rows"

const live = vi.hoisted(() => ({
  rows: [] as SupervisionRow[],
  createWorktreeWithDefaults: vi.fn<(...args: unknown[]) => Promise<{ path: string }>>(async () => ({
    path: "/repo/.worktrees/wt-1",
  })),
  removeProjectWorktree: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({})),
  checkIsGitRepository: vi.fn<(directory: string) => Promise<boolean>>(async () => true),
  syncSessions: [] as Array<{ id: string; directory: string }>,
}))
vi.mock("@/sync/sync-refs", async (original) => ({
  ...(await original<typeof import("@/sync/sync-refs")>()),
  getAllSyncSessions: () => live.syncSessions,
}))
vi.mock("@/hooks/useSupervisionRows", () => ({ useSupervisionRows: () => live.rows }))
vi.mock("@/sync/sync-context", () => ({ useAllLiveSessions: () => [] }))
vi.mock("@/lib/supervision/openSession", () => ({ openSupervisedSession: vi.fn() }))
vi.mock("@/lib/worktrees/worktreeCreate", () => ({
  createWorktreeWithDefaults: (...args: unknown[]) => live.createWorktreeWithDefaults(...args),
}))
vi.mock("@/lib/worktrees/worktreeManager", () => ({
  removeProjectWorktree: (...args: unknown[]) => live.removeProjectWorktree(...args),
}))
vi.mock("@/lib/gitApi", () => ({
  checkIsGitRepository: (directory: string) => live.checkIsGitRepository(directory),
}))

const { QuickDispatchDialog } = await import("./QuickDispatchDialog")

describe("QuickDispatchDialog recent sessions", () => {
  let root: Root
  let container: HTMLDivElement
  let send: ReturnType<typeof vi.spyOn>
  let activate: ReturnType<typeof vi.spyOn>
  let draft: ReturnType<typeof vi.spyOn>
  let resetMode: ReturnType<typeof vi.spyOn>
  let errorToast: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    useProjectsStore.setState({ projects: [{ id: "project", path: "/repo" }], activeProjectId: "project" })
    useSupervisionStore.setState({ quickDispatchOpen: true, recentSessionIds: ["ses_recent"] })
    useConfigStore.setState({
      activeDirectoryKey: "/repo",
      currentProviderId: "current-provider",
      currentModelId: "current-model",
      currentAgentName: "current-agent",
      currentVariant: "current-variant",
    })
    useMessageQueueStore.setState({ queuedMessages: {} })
    live.rows = [
      {
        sessionId: "ses_recent",
        title: "Recent task",
        state: "idle",
        treeSessionIds: ["ses_recent"],
        projectId: "project",
        projectLabel: "Repo",
        directory: "/repo",
        updatedAt: Date.now(),
        evidence: null,
        goal: null,
      },
    ]
    send = vi.spyOn(axCodeClient, "sendMessage").mockResolvedValue("message")
    activate = vi.spyOn(useConfigStore.getState(), "activateDirectory")
    draft = vi.spyOn(useSessionUIStore.getState(), "openNewSessionDraft")
    resetMode = vi.spyOn(useWorkModeStore.getState(), "resetToAgent")
    errorToast = vi.spyOn(toast, "error").mockImplementation(() => "toast")
    vi.spyOn(useSessionUIStore.getState(), "getLastUserChoice").mockReturnValue({
      providerID: "session-provider",
      modelID: "session-model",
      agent: "session-agent",
      variant: "session-variant",
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    expect(activate).not.toHaveBeenCalled()
    expect(draft).not.toHaveBeenCalled()
    expect(resetMode).not.toHaveBeenCalled()
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  const render = async () => {
    await act(async () =>
      root.render(
        <I18nProvider>
          <QuickDispatchDialog />
        </I18nProvider>,
      ),
    )
  }
  const typePrompt = async (value: string) => {
    await act(async () => {
      const input = document.querySelector("textarea")!
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, value)
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
  }
  const clickRecent = async () => {
    await act(async () => {
      const button = Array.from(document.querySelectorAll("button")).find((item) =>
        item.textContent?.includes("Recent task"),
      )!
      button.click()
    })
  }

  test("previews only the active project's model without changing configuration", async () => {
    await render()
    expect(document.body.textContent).toContain("New session at /repo. Work mode will be Agent.")
    expect(document.body.textContent).toContain("Model: current-model")
    await act(async () => {
      useConfigStore.setState({ activeDirectoryKey: "/other" })
    })
    expect(document.body.textContent).not.toContain("Model: current-model")
  })

  test("an empty prompt opens the recent session without sending", async () => {
    await render()
    await typePrompt("   ")
    await clickRecent()
    expect(openSupervisedSession).toHaveBeenCalledWith({
      sessionId: "ses_recent",
      projectId: "project",
      directory: "/repo",
    })
    expect(send).not.toHaveBeenCalled()
    expect(useSupervisionStore.getState().quickDispatchOpen).toBe(false)
  })

  test("sends with session choices, fills gaps from config, and honors openAfter", async () => {
    const previousDirectory = axCodeClient.getDirectory()
    axCodeClient.setDirectory("/other")
    send.mockImplementation(async () => {
      expect(axCodeClient.getDirectory()).toBe("/repo")
      return "message"
    })
    vi.mocked(useSessionUIStore.getState().getLastUserChoice).mockReturnValue({
      providerID: "session-provider",
      agent: "session-agent",
    })
    await render()
    await typePrompt("  Continue the task  ")
    await act(async () => {
      const toggle = document.querySelector<HTMLElement>('[role="button"][aria-pressed]')!
      toggle.click()
    })
    expect(document.body.textContent).toContain(dict["supervision.dispatch.sendToRecent"])
    await clickRecent()
    expect(send).toHaveBeenCalledWith({
      id: "ses_recent",
      text: "Continue the task",
      providerID: "session-provider",
      modelID: "current-model",
      agent: "session-agent",
      variant: "current-variant",
    })
    expect(openSupervisedSession).toHaveBeenCalledOnce()
    expect(useSupervisionStore.getState().quickDispatchOpen).toBe(false)
    expect(axCodeClient.getDirectory()).toBe("/other")
    axCodeClient.setDirectory(previousDirectory)
  })

  test("Space on the checkbox changes the option exactly once", async () => {
    await render()
    const checkbox = document.querySelector<HTMLElement>('[role="checkbox"]')!
    // keydown and keyup are separate browser tasks, so let React flush between them.
    await act(async () => {
      checkbox.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }))
    })
    await act(async () => {
      checkbox.dispatchEvent(new KeyboardEvent("keyup", { key: " ", bubbles: true, cancelable: true }))
    })
    expect(document.querySelector<HTMLElement>('[role="button"][aria-pressed]')!.getAttribute("aria-pressed")).toBe(
      "true",
    )
  })

  test("Enter on the checkbox still changes the option", async () => {
    await render()
    const checkbox = document.querySelector<HTMLElement>('[role="checkbox"]')!
    await act(async () => {
      checkbox.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }))
    })
    expect(document.querySelector<HTMLElement>('[role="button"][aria-pressed]')!.getAttribute("aria-pressed")).toBe(
      "true",
    )
  })

  test("queues into a running session with its own send configuration", async () => {
    live.rows[0].state = "running"
    await render()
    await typePrompt("Continue")
    await clickRecent()
    expect(useMessageQueueStore.getState().getQueueForSession("ses_recent")[0]).toMatchObject({
      content: "Continue",
      sendConfig: {
        providerID: "session-provider",
        modelID: "session-model",
        agent: "session-agent",
        variant: "session-variant",
      },
    })
    expect(send).not.toHaveBeenCalled()
    expect(openSupervisedSession).not.toHaveBeenCalled()
    expect(useSupervisionStore.getState().quickDispatchOpen).toBe(false)
  })

  test.each(["no-model", "queue-full", "send-failed"])("keeps the prompt and dialog after %s", async (failure) => {
    if (failure === "no-model") {
      vi.mocked(useSessionUIStore.getState().getLastUserChoice).mockReturnValue(null)
      useConfigStore.setState({ currentModelId: "" })
    } else if (failure === "queue-full") {
      live.rows[0].state = "running"
      vi.spyOn(useMessageQueueStore.getState(), "addToQueue").mockReturnValue(false)
    } else {
      send.mockRejectedValue(new Error("Send failed"))
    }
    await render()
    await typePrompt("Keep this prompt")
    await clickRecent()
    expect(errorToast).toHaveBeenCalledOnce()
    expect(document.querySelector("textarea")?.value).toBe("Keep this prompt")
    expect(useSupervisionStore.getState().quickDispatchOpen).toBe(true)
    expect(openSupervisedSession).not.toHaveBeenCalled()
    if (failure !== "send-failed") expect(send).not.toHaveBeenCalled()
  })
})

describe("QuickDispatchDialog worktree-first dispatch", () => {
  let root: Root
  let container: HTMLDivElement
  let errorToast: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    live.rows = []
    live.syncSessions = []
    live.createWorktreeWithDefaults.mockReset()
    live.createWorktreeWithDefaults.mockResolvedValue({ path: "/repo/.worktrees/wt-1" })
    live.removeProjectWorktree.mockReset()
    live.removeProjectWorktree.mockResolvedValue({})
    live.checkIsGitRepository.mockReset()
    live.checkIsGitRepository.mockResolvedValue(true)
    useProjectsStore.setState({ projects: [{ id: "project", path: "/repo" }], activeProjectId: "project" })
    useGitStore.setState({ directories: new Map([["/repo", { isGitRepo: true } as never]]) })
    useSupervisionStore.setState({ quickDispatchOpen: true, recentSessionIds: [] })
    useConfigStore.setState({
      activeDirectoryKey: "/repo",
      currentProviderId: "p1",
      currentModelId: "m1",
      currentAgentName: "",
      currentVariant: undefined,
    })
    errorToast = vi.spyOn(toast, "error").mockImplementation(() => "toast")
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    useGitStore.setState({ directories: new Map() })
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  const render = async () => {
    await act(async () =>
      root.render(
        <I18nProvider>
          <QuickDispatchDialog />
        </I18nProvider>,
      ),
    )
  }

  const typePrompt = async (value: string) => {
    await act(async () => {
      const input = document.querySelector("textarea")!
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, value)
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
  }

  const clickStart = async () => {
    await act(async () => {
      const button = Array.from(document.querySelectorAll("button")).find(
        (item) => item.textContent === dict["supervision.dispatch.start"],
      )!
      button.click()
    })
  }

  test("defaults to Git worktree isolation and dispatches into the created worktree path", async () => {
    const openDraft = vi.spyOn(useSessionUIStore.getState(), "openNewSessionDraft").mockImplementation(() => {})
    const activateDir = vi.spyOn(useConfigStore.getState(), "activateDirectory").mockResolvedValue()
    const sendSessionMsg = vi.spyOn(useSessionUIStore.getState(), "sendMessage").mockResolvedValue()

    await render()
    expect(document.querySelector("[data-dispatch-isolation-hint]")?.textContent).toBe(
      dict["supervision.dispatch.worktreeHint"],
    )
    await typePrompt("Implement feature safely")
    await clickStart()

    expect(live.createWorktreeWithDefaults).toHaveBeenCalledOnce()
    expect(openDraft).toHaveBeenCalledWith(
      expect.objectContaining({ selectedProjectId: "project", directoryOverride: "/repo/.worktrees/wt-1" }),
    )
    expect(activateDir).toHaveBeenCalledWith("/repo/.worktrees/wt-1")
    expect(sendSessionMsg).toHaveBeenCalledOnce()
  })

  test("dispatches to shared directory when worktree isolation is unchecked", async () => {
    const openDraft = vi.spyOn(useSessionUIStore.getState(), "openNewSessionDraft").mockImplementation(() => {})
    vi.spyOn(useConfigStore.getState(), "activateDirectory").mockResolvedValue()
    vi.spyOn(useSessionUIStore.getState(), "sendMessage").mockResolvedValue()

    await render()
    await act(async () => {
      document.querySelector<HTMLElement>("[data-dispatch-isolate-worktree]")!.click()
    })
    expect(document.querySelector("[data-dispatch-isolation-hint]")?.textContent).toBe(
      dict["supervision.dispatch.sharedDirectoryHint"],
    )
    await typePrompt("Quick tweak in main dir")
    await clickStart()

    expect(live.createWorktreeWithDefaults).not.toHaveBeenCalled()
    expect(openDraft).toHaveBeenCalledWith(
      expect.objectContaining({ selectedProjectId: "project", directoryOverride: "/repo" }),
    )
  })

  test("aborts without mutating the shared directory when worktree creation fails", async () => {
    live.createWorktreeWithDefaults.mockRejectedValue(new Error("git worktree add failed"))
    const openDraft = vi.spyOn(useSessionUIStore.getState(), "openNewSessionDraft").mockImplementation(() => {})

    await render()
    await typePrompt("Needs isolation")
    await clickStart()

    expect(errorToast).toHaveBeenCalledWith(dict["supervision.dispatch.worktreeFailed"])
    expect(openDraft).not.toHaveBeenCalled()
    expect(useSupervisionStore.getState().quickDispatchOpen).toBe(true)
  })

  test("probes a project with no loaded Git state instead of dispatching into its shared tree", async () => {
    useGitStore.setState({ directories: new Map(), repoSummaries: new Map() })
    const openDraft = vi.spyOn(useSessionUIStore.getState(), "openNewSessionDraft").mockImplementation(() => {})
    vi.spyOn(useConfigStore.getState(), "activateDirectory").mockResolvedValue()
    vi.spyOn(useSessionUIStore.getState(), "sendMessage").mockResolvedValue()

    await render()
    expect(live.checkIsGitRepository).toHaveBeenCalledWith("/repo")
    expect(document.querySelector("[data-dispatch-isolation-hint]")?.textContent).toBe(
      dict["supervision.dispatch.worktreeHint"],
    )
    await typePrompt("Dispatched from afar")
    await clickStart()

    expect(live.createWorktreeWithDefaults).toHaveBeenCalledOnce()
    expect(openDraft).toHaveBeenCalledWith(expect.objectContaining({ directoryOverride: "/repo/.worktrees/wt-1" }))
  })

  test("cannot start while the repository check is still open", async () => {
    useGitStore.setState({ directories: new Map(), repoSummaries: new Map() })
    live.checkIsGitRepository.mockReturnValue(new Promise<boolean>(() => {}))
    const openDraft = vi.spyOn(useSessionUIStore.getState(), "openNewSessionDraft").mockImplementation(() => {})

    await render()
    await typePrompt("Too early")
    await clickStart()

    // The shortcut does not go through the disabled button.
    await act(async () => {
      document
        .querySelector("textarea")!
        .dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", metaKey: true, bubbles: true }))
    })

    expect(document.querySelector("[data-dispatch-isolation-hint]")).toBeNull()
    expect(openDraft).not.toHaveBeenCalled()
    expect(live.createWorktreeWithDefaults).not.toHaveBeenCalled()
  })

  test("a failed repository check keeps the start closed instead of dispatching into the shared tree", async () => {
    useGitStore.setState({ directories: new Map(), repoSummaries: new Map() })
    live.checkIsGitRepository.mockRejectedValue(new Error("offline"))
    const openDraft = vi.spyOn(useSessionUIStore.getState(), "openNewSessionDraft").mockImplementation(() => {})

    await render()
    await typePrompt("Probe failed")
    await clickStart()
    await act(async () => {
      document
        .querySelector("textarea")!
        .dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }))
    })

    expect(openDraft).not.toHaveBeenCalled()
  })

  test("removes the worktree it created when the dispatch never produced a session", async () => {
    useConfigStore.setState({ currentProviderId: "", currentModelId: "" })
    vi.spyOn(useSessionUIStore.getState(), "openNewSessionDraft").mockImplementation(() => {})
    vi.spyOn(useConfigStore.getState(), "activateDirectory").mockResolvedValue()
    const sendSessionMsg = vi.spyOn(useSessionUIStore.getState(), "sendMessage").mockResolvedValue()

    await render()
    await typePrompt("No model configured")
    await clickStart()

    expect(sendSessionMsg).not.toHaveBeenCalled()
    expect(live.removeProjectWorktree).toHaveBeenCalledWith(
      { id: "project", path: "/repo" },
      { path: "/repo/.worktrees/wt-1" },
      { deleteLocalBranch: true },
    )
    expect(errorToast).toHaveBeenCalledWith(dict["chat.chatInput.toast.noModelSelected"])
  })

  test("keeps the worktree when the send failed after the runtime created a session in it", async () => {
    vi.spyOn(useSessionUIStore.getState(), "openNewSessionDraft").mockImplementation(() => {})
    vi.spyOn(useConfigStore.getState(), "activateDirectory").mockResolvedValue()
    vi.spyOn(useSessionUIStore.getState(), "sendMessage").mockImplementation(async () => {
      // The session exists on the runtime, but the view never moved to it.
      live.syncSessions = [{ id: "ses_orphan", directory: "/repo/.worktrees/wt-1" }]
      throw new Error("activation failed")
    })

    await render()
    await typePrompt("Fails after create")
    await clickStart()

    expect(live.createWorktreeWithDefaults).toHaveBeenCalled()
    expect(live.removeProjectWorktree).not.toHaveBeenCalled()
  })

  test("does not send the prompt to a session the person switched to while the worktree was activating", async () => {
    useSessionUIStore.setState({ currentSessionId: null })
    live.syncSessions = [{ id: "ses_existing", directory: "/repo" }]
    vi.spyOn(useSessionUIStore.getState(), "openNewSessionDraft").mockImplementation(() => {})
    vi.spyOn(useConfigStore.getState(), "activateDirectory").mockImplementation(async () => {
      useSessionUIStore.setState({ currentSessionId: "ses_existing" })
    })
    const sendSessionMsg = vi.spyOn(useSessionUIStore.getState(), "sendMessage").mockResolvedValue()

    await render()
    await typePrompt("Switched away")
    await clickStart()

    expect(sendSessionMsg).not.toHaveBeenCalled()
    expect(live.removeProjectWorktree).toHaveBeenCalledWith(
      { id: "project", path: "/repo" },
      { path: "/repo/.worktrees/wt-1" },
      { deleteLocalBranch: true },
    )
  })
})
