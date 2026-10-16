import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"

const stubStore = <State,>(state: State) => {
  const useStore = ((selector?: (value: State) => unknown) => (selector ? selector(state) : state)) as unknown as {
    (selector?: (value: State) => unknown): unknown
    getState: () => State
  }
  useStore.getState = () => state
  return useStore
}

vi.mock("@/components/ui", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

vi.mock("@/stores/useDirectoryStore", () => ({
  useDirectoryStore: stubStore({ currentDirectory: "/repo", homeDirectory: "/home/user" }),
}))
vi.mock("@/stores/useProjectsStore", () => ({
  useProjectsStore: stubStore({
    activeProjectId: null as string | null,
    setActiveProjectIdOnly: vi.fn(),
    projects: [] as { id: string; path: string }[],
  }),
}))
vi.mock("@/stores/useMultiRunStore", () => ({
  useMultiRunStore: stubStore({ createMultiRun: vi.fn(), error: null, clearError: vi.fn() }),
}))
vi.mock("@/sync/session-ui-store", () => ({
  useSessionUIStore: { getState: () => ({ setCurrentSession: vi.fn() }) },
}))
vi.mock("@/contexts/useThemeSystem", () => ({
  useThemeSystem: () => ({
    currentTheme: { metadata: { variant: "dark" }, colors: { surface: { foreground: "#fff" } } },
  }),
}))
vi.mock("@/lib/projectMeta", () => ({
  PROJECT_ICON_MAP: {},
  PROJECT_COLOR_MAP: {},
  getProjectIconImageUrl: () => null,
}))
vi.mock("@/lib/openchamberConfig", () => ({ getWorktreeSetupCommands: vi.fn(async () => []) }))
vi.mock("./BranchSelector", () => ({
  BranchSelector: () => null,
  useBranchOptions: () => ({ isLoading: false, isGitRepository: false }),
}))
vi.mock("./AgentSelector", () => ({ AgentSelector: () => null }))
vi.mock("./ModelMultiSelect", () => ({
  ModelMultiSelect: () => null,
  generateInstanceId: () => "instance-1",
}))
vi.mock("@/components/chat/CommandAutocomplete", () => ({ CommandAutocomplete: () => null }))
vi.mock("@/components/chat/FileMentionAutocomplete", () => ({ FileMentionAutocomplete: () => null }))
vi.mock("@/components/chat/SnippetAutocomplete", () => ({ SnippetAutocomplete: () => null }))

const { MultiRunLauncher } = await import("./MultiRunLauncher")

const escapeEvent = () => {
  const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
  return event
}

describe("MultiRunLauncher Escape handling", () => {
  let container: HTMLDivElement
  let root: Root
  let onCancel: () => void

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    onCancel = vi.fn()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  const renderLauncher = async () => {
    await act(async () => {
      root.render(
        <I18nProvider>
          <MultiRunLauncher onCancel={onCancel} />
        </I18nProvider>,
      )
    })
  }

  test("Escape cancels the launcher", async () => {
    await renderLauncher()
    act(() => {
      window.dispatchEvent(escapeEvent())
    })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  // A prompt autocomplete handles Escape first and marks the event handled. The launcher used to listen
  // in the capture phase, so it ran *before* that handler, closed, and threw away every typed prompt.
  test("Escape already handled by a prompt popup does not cancel the launcher", async () => {
    await renderLauncher()
    const handled = escapeEvent()
    handled.preventDefault()
    act(() => {
      window.dispatchEvent(handled)
    })
    expect(onCancel).not.toHaveBeenCalled()
  })
})
