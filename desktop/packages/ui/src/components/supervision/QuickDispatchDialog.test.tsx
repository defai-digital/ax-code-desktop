import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"
import { dict } from "@/lib/i18n/messages/en"
import { axCodeClient } from "@/lib/ax-code/client"
import { toast } from "@/components/ui"
import { useConfigStore } from "@/stores/useConfigStore"
import { useProjectsStore } from "@/stores/useProjectsStore"
import { useSupervisionStore } from "@/stores/useSupervisionStore"
import { useMessageQueueStore } from "@/stores/messageQueueStore"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { useWorkModeStore } from "@/stores/useWorkModeStore"
import { openSupervisedSession } from "@/lib/supervision/openSession"
import type { SupervisionRow } from "@/lib/supervision/rows"

const live = vi.hoisted(() => ({ rows: [] as SupervisionRow[] }))
vi.mock("@/hooks/useSupervisionRows", () => ({ useSupervisionRows: () => live.rows }))
vi.mock("@/sync/sync-context", () => ({ useAllLiveSessions: () => [] }))
vi.mock("@/lib/supervision/openSession", () => ({ openSupervisedSession: vi.fn() }))

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
