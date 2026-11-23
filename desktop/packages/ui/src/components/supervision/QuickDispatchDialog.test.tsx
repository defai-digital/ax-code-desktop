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
import { useSelectionStore } from "@/sync/selection-store"
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
  routeMessage: vi.fn<(params: Record<string, unknown>) => Promise<void>>(async () => {}),
  notifyMessageSent: vi.fn<(sessionId: string) => void>(),
  workModeSendRefusalMessage: vi.fn<(input: Record<string, unknown>) => Promise<string | null>>(async () => null),
  waitForWorktreeBootstrap: vi.fn<(directory: string) => Promise<void>>(async () => {}),
  seedSessionAutoAccept: vi.fn<(sessionId: string, parentId: string | null) => void>(),
  getWorktreeSetupCommands: vi.fn<(project: unknown) => Promise<string[]>>(async () => []),
  getRootBranch: vi.fn<(directory: string) => Promise<string>>(async () => "main"),
}))
vi.mock("@/lib/openchamberConfig", async (original) => ({
  ...(await original<typeof import("@/lib/openchamberConfig")>()),
  getWorktreeSetupCommands: (project: unknown) => live.getWorktreeSetupCommands(project),
}))
vi.mock("@/lib/worktrees/worktreeStatus", async (original) => ({
  ...(await original<typeof import("@/lib/worktrees/worktreeStatus")>()),
  getRootBranch: (directory: string) => live.getRootBranch(directory),
}))
vi.mock("@/sync/session-ui-store", async (original) => ({
  ...(await original<typeof import("@/sync/session-ui-store")>()),
  routeMessage: (params: Record<string, unknown>) => live.routeMessage(params),
  notifyMessageSent: (sessionId: string) => live.notifyMessageSent(sessionId),
  workModeSendRefusalMessage: (input: Record<string, unknown>) => live.workModeSendRefusalMessage(input),
}))
vi.mock("@/stores/utils/sessionAutoAcceptSeed", async (original) => ({
  ...(await original<typeof import("@/stores/utils/sessionAutoAcceptSeed")>()),
  seedSessionAutoAccept: (sessionId: string, parentId: string | null) => live.seedSessionAutoAccept(sessionId, parentId),
}))
vi.mock("@/lib/worktrees/worktreeBootstrap", () => ({
  waitForWorktreeBootstrap: (directory: string) => live.waitForWorktreeBootstrap(directory),
}))
vi.mock("@/hooks/useSupervisionRows", () => ({ useSupervisionRows: () => live.rows }))
vi.mock("@/sync/sync-context", async (original) => ({
  ...(await original<typeof import("@/sync/sync-context")>()),
  useAllLiveSessions: () => [],
}))
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
const WORKTREE = "/repo/.worktrees/wt-1"
const CATALOG = [{ id: "p1", models: [{ id: "m1" }, { id: "m2" }] }]

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

  test("previews the model the project's new session would get, without changing configuration", async () => {
    useConfigStore.setState({
      providers: [{ id: "current-provider", models: [{ id: "current-model" }] }],
      directoryScoped: {},
    } as never)
    const loadProviders = vi.spyOn(useConfigStore.getState(), "loadProviders").mockResolvedValue()
    vi.spyOn(axCodeClient, "listAgents").mockResolvedValue([])
    await render()
    expect(document.body.textContent).toContain("New session at /repo. Work mode will be Agent.")
    expect(document.body.textContent).toContain("Model: current-model")
    expect(loadProviders).not.toHaveBeenCalled()
    // Another directory is active and this project's providers are not known yet: nothing to promise until they load.
    await act(async () => {
      useConfigStore.setState({ activeDirectoryKey: "/other" })
    })
    expect(document.body.textContent).not.toContain("Model:")
    expect(loadProviders).toHaveBeenCalledWith({ directory: "/repo" })
    await act(async () => {
      useConfigStore.setState({
        directoryScoped: { "/repo": { providers: [{ id: "cold-provider", models: [{ id: "cold-model" }] }] } },
      } as never)
    })
    expect(document.body.textContent).toContain("Model: cold-model")
    // The composer stayed on its own directory and selection.
    expect(useConfigStore.getState()).toMatchObject({ activeDirectoryKey: "/other", currentModelId: "current-model" })
    useConfigStore.setState({ providers: [], directoryScoped: {} } as never)
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

describe("QuickDispatchDialog new-session dispatch", () => {
  let root: Root
  let container: HTMLDivElement
  let errorToast: ReturnType<typeof vi.spyOn>
  let createSession: ReturnType<typeof vi.spyOn>
  let activate: ReturnType<typeof vi.spyOn>
  let openDraft: ReturnType<typeof vi.spyOn>
  let listAgents: ReturnType<typeof vi.spyOn>
  let created = 0

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    created = 0
    live.rows = []
    live.createWorktreeWithDefaults.mockReset()
    live.createWorktreeWithDefaults.mockResolvedValue({ path: WORKTREE })
    live.removeProjectWorktree.mockReset()
    live.removeProjectWorktree.mockResolvedValue({})
    live.checkIsGitRepository.mockReset()
    live.checkIsGitRepository.mockResolvedValue(true)
    live.routeMessage.mockReset()
    live.routeMessage.mockResolvedValue()
    live.notifyMessageSent.mockReset()
    live.workModeSendRefusalMessage.mockReset()
    live.workModeSendRefusalMessage.mockResolvedValue(null)
    live.waitForWorktreeBootstrap.mockReset()
    live.waitForWorktreeBootstrap.mockResolvedValue()
    live.getWorktreeSetupCommands.mockReset()
    live.getWorktreeSetupCommands.mockResolvedValue([])
    live.getRootBranch.mockReset()
    live.getRootBranch.mockResolvedValue("main")
    useProjectsStore.setState({ projects: [{ id: "project", path: "/repo" }], activeProjectId: "project" })
    useGitStore.setState({ directories: new Map([["/repo", { isGitRepo: true } as never]]) })
    useSupervisionStore.setState({ quickDispatchOpen: true, recentSessionIds: [] })
    useSessionUIStore.getState().closeNewSessionDraft()
    useSessionUIStore.setState({ currentSessionId: "ses_viewing", worktreeMetadata: new Map() })
    useConfigStore.setState({
      activeDirectoryKey: "/repo",
      providers: CATALOG,
      directoryScoped: {},
      currentProviderId: "p1",
      currentModelId: "m1",
      currentAgentName: "build",
      currentVariant: undefined,
      settingsDefaultModel: undefined,
    } as never)
    createSession = vi
      .spyOn(axCodeClient, "createSessionInDirectory")
      .mockImplementation(async () => ({ id: `ses_new_${++created}`, title: "" }) as never)
    activate = vi.spyOn(useConfigStore.getState(), "activateDirectory")
    openDraft = vi.spyOn(useSessionUIStore.getState(), "openNewSessionDraft")
    listAgents = vi.spyOn(axCodeClient, "listAgents").mockResolvedValue([])
    errorToast = vi.spyOn(toast, "error").mockImplementation(() => "toast")
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    // A dispatch never touches the composer: whatever happened, its directory and draft were left alone.
    expect(activate).not.toHaveBeenCalled()
    expect(openDraft).not.toHaveBeenCalled()
    expect(useSessionUIStore.getState().currentSessionId).toBe("ses_viewing")
    expect(useSessionUIStore.getState().newSessionDraft?.open ?? false).toBe(false)
    useGitStore.setState({ directories: new Map() })
    useConfigStore.setState({ providers: [], directoryScoped: {} } as never)
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

  const toggleOpenAfter = async () => {
    await act(async () => {
      document.querySelector<HTMLElement>('[role="button"][aria-pressed]')!.click()
    })
  }

  const dispatch = async (prompt = "Implement feature safely") => {
    await render()
    await typePrompt(prompt)
    await clickStart()
  }

  test("starts the session in a new worktree and sends the prompt there, leaving the view alone", async () => {
    await render()
    expect(document.querySelector("[data-dispatch-isolation-hint]")?.textContent).toBe(
      dict["supervision.dispatch.worktreeHint"],
    )
    await typePrompt("Implement feature safely")
    await clickStart()

    expect(live.createWorktreeWithDefaults).toHaveBeenCalledOnce()
    expect(createSession).toHaveBeenCalledWith(WORKTREE)
    expect(live.waitForWorktreeBootstrap).toHaveBeenCalledWith(WORKTREE)
    expect(live.notifyMessageSent).toHaveBeenCalledWith("ses_new_1")
    expect(live.routeMessage).toHaveBeenCalledWith({
      sessionId: "ses_new_1",
      directory: WORKTREE,
      content: "Implement feature safely",
      providerID: "p1",
      modelID: "m1",
      agent: "build",
      variant: undefined,
      // Routing judges the work mode against the same catalog the pre-check used.
      workModeProviders: CATALOG,
    })
    expect(useSessionUIStore.getState().getWorktreeMetadata("ses_new_1")).toMatchObject({
      path: WORKTREE,
      createdFromBranch: "main",
      kind: "standard",
    })
    expect(live.seedSessionAutoAccept).toHaveBeenCalledWith("ses_new_1", null)
    // Opening the session later shows the selection its first prompt used.
    expect(useSelectionStore.getState().getSessionModelSelection("ses_new_1")).toMatchObject({
      providerId: "p1",
      modelId: "m1",
    })
    expect(useSelectionStore.getState().getSessionAgentSelection("ses_new_1")).toBe("build")
    expect(openSupervisedSession).not.toHaveBeenCalled()
    expect(errorToast).not.toHaveBeenCalled()
    expect(useSupervisionStore.getState().quickDispatchOpen).toBe(false)
  })

  test("runs the project's worktree setup commands in the new worktree", async () => {
    live.getWorktreeSetupCommands.mockResolvedValue(["pnpm install", "cp .env.example .env"])

    await dispatch()

    expect(live.createWorktreeWithDefaults).toHaveBeenCalledWith(
      { id: "project", path: "/repo" },
      expect.objectContaining({ setupCommands: ["pnpm install", "cp .env.example .env"] }),
    )
    expect(live.waitForWorktreeBootstrap).toHaveBeenCalledWith(WORKTREE)
  })

  test("runs in the shared directory when isolation is off", async () => {
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
    expect(createSession).toHaveBeenCalledWith("/repo")
    expect(live.waitForWorktreeBootstrap).not.toHaveBeenCalled()
    expect(live.routeMessage).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "ses_new_1", directory: "/repo" }))
  })

  test("a project that is not active uses its own saved selection and catalog, not the composer's", async () => {
    useConfigStore.setState({
      activeDirectoryKey: "/elsewhere",
      directoryScoped: {
        "/repo": {
          providers: CATALOG,
          currentProviderId: "p1",
          currentModelId: "m2",
          currentVariant: "high",
          currentAgentName: "plan",
          // Picked by hand, so activating the project would keep it over every default.
          selectionSource: "manual",
        },
      },
    } as never)
    listAgents.mockResolvedValue([{ name: "build", mode: "primary" }, { name: "plan", mode: "primary" }])
    const loadProviders = vi.spyOn(useConfigStore.getState(), "loadProviders")

    await dispatch()

    expect(loadProviders).not.toHaveBeenCalled()
    expect(listAgents).toHaveBeenCalledWith("/repo")
    expect(live.workModeSendRefusalMessage).toHaveBeenCalledWith(
      expect.objectContaining({ providerID: "p1", modelID: "m2", providers: CATALOG }),
    )
    expect(live.routeMessage).toHaveBeenCalledWith(
      expect.objectContaining({ providerID: "p1", modelID: "m2", agent: "plan", variant: "high" }),
    )
    expect(useConfigStore.getState()).toMatchObject({ activeDirectoryKey: "/elsewhere", currentModelId: "m1" })
  })

  test("a project not opened yet gets the default agent and the model pinned to it, as activating it would", async () => {
    useConfigStore.setState({
      activeDirectoryKey: "/elsewhere",
      settingsDefaultAgent: "plan",
      directoryScoped: { "/repo": { providers: CATALOG } },
    } as never)
    listAgents.mockResolvedValue([
      { name: "build", mode: "primary" },
      { name: "plan", mode: "primary", model: { providerID: "p1", modelID: "m2" } },
    ])

    await dispatch()

    expect(live.routeMessage).toHaveBeenCalledWith(
      expect.objectContaining({ providerID: "p1", modelID: "m2", agent: "plan" }),
    )
    expect(useSelectionStore.getState().getSessionAgentSelection("ses_new_1")).toBe("plan")
    useConfigStore.setState({ settingsDefaultAgent: undefined } as never)
  })

  test("loads the providers of a project not opened yet without switching the composer to it", async () => {
    useConfigStore.setState({ activeDirectoryKey: "/elsewhere", settingsDefaultModel: "p1/m2" } as never)
    const loadProviders = vi.spyOn(useConfigStore.getState(), "loadProviders").mockImplementation(async () => {
      useConfigStore.setState((state) => ({
        directoryScoped: { ...state.directoryScoped, "/repo": { providers: CATALOG } as never },
      }))
      return true as never
    })

    await dispatch()

    expect(loadProviders).toHaveBeenCalledWith({ directory: "/repo" })
    // Nothing was picked for this project yet: the Settings default applies, as activation would pick.
    expect(live.routeMessage).toHaveBeenCalledWith(expect.objectContaining({ providerID: "p1", modelID: "m2" }))
    expect(useConfigStore.getState().activeDirectoryKey).toBe("/elsewhere")
  })

  test("with no model for the project nothing is created", async () => {
    useConfigStore.setState({ activeDirectoryKey: "/elsewhere" } as never)
    vi.spyOn(useConfigStore.getState(), "loadProviders").mockResolvedValue(false as never)

    await dispatch()

    expect(errorToast).toHaveBeenCalledWith(dict["chat.chatInput.toast.noModelSelected"])
    expect(live.createWorktreeWithDefaults).not.toHaveBeenCalled()
    expect(createSession).not.toHaveBeenCalled()
    expect(useSupervisionStore.getState().quickDispatchOpen).toBe(true)
  })

  test("a work-mode refusal is shown before any worktree or session exists", async () => {
    live.workModeSendRefusalMessage.mockResolvedValue("Council needs a model with tool calling")

    await dispatch("/council review this")

    expect(errorToast).toHaveBeenCalledOnce()
    expect(errorToast).toHaveBeenCalledWith("Council needs a model with tool calling")
    expect(live.createWorktreeWithDefaults).not.toHaveBeenCalled()
    expect(createSession).not.toHaveBeenCalled()
    expect(live.routeMessage).not.toHaveBeenCalled()
    expect(useSupervisionStore.getState().quickDispatchOpen).toBe(true)
    // The refusal is the dialog's to show; the composer's error line is someone else's.
    expect(useSessionUIStore.getState().error).toBeFalsy()
  })

  test("a work-mode check that could not run stops the dispatch before anything is created", async () => {
    live.workModeSendRefusalMessage.mockRejectedValue(new Error("catalog unavailable"))

    await dispatch()

    expect(errorToast).toHaveBeenCalledWith(dict["session.githubIssuePicker.toast.startSessionFailed"])
    expect(live.createWorktreeWithDefaults).not.toHaveBeenCalled()
    expect(createSession).not.toHaveBeenCalled()
    expect(live.routeMessage).not.toHaveBeenCalled()
  })

  test("a failed worktree creation creates no session", async () => {
    live.createWorktreeWithDefaults.mockRejectedValue(new Error("git worktree add failed"))

    await dispatch()

    expect(errorToast).toHaveBeenCalledWith(dict["supervision.dispatch.worktreeFailed"])
    expect(createSession).not.toHaveBeenCalled()
    expect(useSupervisionStore.getState().quickDispatchOpen).toBe(true)
  })

  test("keeps the worktree and says where it is when the create request fails", async () => {
    createSession.mockRejectedValue(new Error("socket hang up"))

    await dispatch()

    // The runtime may have made the session before the response was lost, and the worktree is already listed.
    expect(live.removeProjectWorktree).not.toHaveBeenCalled()
    expect(errorToast).toHaveBeenCalledOnce()
    expect(errorToast).toHaveBeenCalledWith(dict["supervision.dispatch.createUnknown"].replace("{path}", WORKTREE))
    expect(live.routeMessage).not.toHaveBeenCalled()
    expect(useSessionUIStore.getState().error).toBeFalsy()
    expect(useSupervisionStore.getState().quickDispatchOpen).toBe(true)
  })

  test("a failed create in the shared directory reports the start failure", async () => {
    createSession.mockRejectedValue(new Error("boom"))
    await render()
    await act(async () => {
      document.querySelector<HTMLElement>("[data-dispatch-isolate-worktree]")!.click()
    })
    await typePrompt("Shared")
    await clickStart()

    expect(errorToast).toHaveBeenCalledOnce()
    expect(errorToast).toHaveBeenCalledWith(dict["session.githubIssuePicker.toast.startSessionFailed"])
  })

  test("a failed send links the session this dispatch created, even after the view moved", async () => {
    live.routeMessage.mockImplementation(async () => {
      // Another session becomes current while the prompt is in flight.
      useSessionUIStore.setState({ currentSessionId: "ses_other" })
      throw new Error("send failed")
    })

    await dispatch("Fix the parser")
    useSessionUIStore.setState({ currentSessionId: "ses_viewing" })

    expect(live.removeProjectWorktree).not.toHaveBeenCalled()
    expect(errorToast).toHaveBeenCalledOnce()
    const [message, options] = errorToast.mock.calls[0] as [string, { action: { onClick: () => void } }]
    expect(message).toBe(dict["supervision.dispatch.createdFailed"].replace("{title}", "Fix the parser"))
    options.action.onClick()
    expect(openSupervisedSession).toHaveBeenCalledWith({
      sessionId: "ses_new_1",
      projectId: "project",
      directory: WORKTREE,
    })
    expect(useSupervisionStore.getState().quickDispatchOpen).toBe(false)
  })

  test("opens the session afterwards when asked", async () => {
    await render()
    await toggleOpenAfter()
    await typePrompt("Open me")
    await clickStart()
    expect(openSupervisedSession).toHaveBeenCalledOnce()
    expect(openSupervisedSession).toHaveBeenCalledWith({
      sessionId: "ses_new_1",
      projectId: "project",
      directory: WORKTREE,
    })
  })

  test("a dispatch that finishes after the dialog was dismissed does not take the view", async () => {
    let finishSend: () => void = () => {}
    live.routeMessage.mockImplementation(() => new Promise<void>((resolve) => (finishSend = resolve)))
    await render()
    await toggleOpenAfter()
    await typePrompt("Open me later")
    await clickStart()
    await act(async () => {
      useSupervisionStore.setState({ quickDispatchOpen: false })
    })
    await act(async () => finishSend())
    expect(live.routeMessage).toHaveBeenCalledOnce()
    expect(openSupervisedSession).not.toHaveBeenCalled()
  })

  test("unchecking Open the session while the dispatch runs is honoured", async () => {
    let finishSend: () => void = () => {}
    live.routeMessage.mockImplementation(() => new Promise<void>((resolve) => (finishSend = resolve)))
    await render()
    await toggleOpenAfter()
    await typePrompt("Changed my mind")
    await clickStart()
    await toggleOpenAfter()

    await act(async () => finishSend())

    expect(openSupervisedSession).not.toHaveBeenCalled()
    expect(useSupervisionStore.getState().quickDispatchOpen).toBe(false)
  })

  test.each(["sent", "send failed"] as const)(
    "a dispatch that finishes (%s) after the dialog was dismissed and opened again leaves the new dialog alone",
    async (outcome) => {
      let finishSend: () => void = () => {}
      live.routeMessage.mockImplementation(
        () =>
          new Promise<void>((resolve, reject) => {
            finishSend = outcome === "sent" ? resolve : () => reject(new Error("send failed"))
          }),
      )
      await render()
      await toggleOpenAfter()
      await typePrompt("First task")
      await clickStart()
      await act(async () => {
        useSupervisionStore.setState({ quickDispatchOpen: false })
      })
      await act(async () => {
        useSupervisionStore.setState({ quickDispatchOpen: true })
      })
      await typePrompt("Second task, still typing")

      await act(async () => finishSend())

      expect(useSupervisionStore.getState().quickDispatchOpen).toBe(true)
      expect(document.querySelector("textarea")?.value).toBe("Second task, still typing")
      expect(openSupervisedSession).not.toHaveBeenCalled()
      // A failed send still says so, with its link to the session it made.
      expect(errorToast).toHaveBeenCalledTimes(outcome === "sent" ? 0 : 1)
    },
  )

  test("probes a project with no loaded Git state instead of dispatching into its shared tree", async () => {
    useGitStore.setState({ directories: new Map(), repoSummaries: new Map() })

    await render()
    expect(live.checkIsGitRepository).toHaveBeenCalledWith("/repo")
    expect(document.querySelector("[data-dispatch-isolation-hint]")?.textContent).toBe(
      dict["supervision.dispatch.worktreeHint"],
    )
    await typePrompt("Dispatched from afar")
    await clickStart()

    expect(live.createWorktreeWithDefaults).toHaveBeenCalledOnce()
    expect(createSession).toHaveBeenCalledWith(WORKTREE)
  })

  test("cannot start while the repository check is still open", async () => {
    useGitStore.setState({ directories: new Map(), repoSummaries: new Map() })
    live.checkIsGitRepository.mockReturnValue(new Promise<boolean>(() => {}))

    await render()
    await typePrompt("Too early")
    const startButton = Array.from(document.querySelectorAll("button")).find(
      (item) => item.textContent === dict["supervision.dispatch.start"],
    )!
    expect(startButton.disabled).toBe(true)
    expect(document.querySelector("[data-dispatch-repo-check]")?.getAttribute("data-dispatch-repo-check")).toBe(
      "pending",
    )
    await clickStart()

    // The shortcut does not go through the disabled button.
    await act(async () => {
      document
        .querySelector("textarea")!
        .dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", metaKey: true, bubbles: true }))
    })

    expect(document.querySelector("[data-dispatch-isolation-hint]")).toBeNull()
    expect(createSession).not.toHaveBeenCalled()
    expect(live.createWorktreeWithDefaults).not.toHaveBeenCalled()
  })

  test("a failed repository check keeps the start closed instead of dispatching into the shared tree", async () => {
    useGitStore.setState({ directories: new Map(), repoSummaries: new Map() })
    live.checkIsGitRepository.mockRejectedValue(new Error("offline"))

    await render()
    await typePrompt("Probe failed")
    await clickStart()
    await act(async () => {
      document
        .querySelector("textarea")!
        .dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }))
    })

    expect(createSession).not.toHaveBeenCalled()
    expect(document.querySelector("[data-dispatch-repo-check]")?.getAttribute("data-dispatch-repo-check")).toBe(
      "failed",
    )

    // Checking again is the way out; once it answers, the dispatch isolates as usual.
    live.checkIsGitRepository.mockResolvedValue(true)
    await act(async () => {
      document.querySelector<HTMLButtonElement>("[data-dispatch-repo-check] button")!.click()
    })
    expect(document.querySelector("[data-dispatch-repo-check]")).toBeNull()
    expect(document.querySelector("[data-dispatch-isolation-hint]")?.textContent).toBe(
      dict["supervision.dispatch.worktreeHint"],
    )
  })
})
