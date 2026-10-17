import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"
import { dict } from "@/lib/i18n/messages/en"

type CreateMultiRunResult = {
  groupSlug: string
  sessionIds: string[]
  firstSessionId: string | null
  startedRunCount: number
}

const { createMultiRun, toastError, addedModels, instanceIds } = vi.hoisted(() => ({
  createMultiRun: vi.fn<() => Promise<CreateMultiRunResult | null>>(),
  toastError: vi.fn<(message: string) => void>(),
  addedModels: { current: 0 },
  instanceIds: { current: 0 },
}))

const stubStore = <State,>(state: State) => {
  const useStore = ((selector?: (value: State) => unknown) => (selector ? selector(state) : state)) as unknown as {
    (selector?: (value: State) => unknown): unknown
    getState: () => State
  }
  useStore.getState = () => state
  return useStore
}

vi.mock("@/components/ui", () => ({ toast: { error: toastError, success: vi.fn() } }))

vi.mock("@/stores/useDirectoryStore", () => ({
  useDirectoryStore: stubStore({ currentDirectory: "/repo", homeDirectory: "/home/user" }),
}))
const { projectsState } = vi.hoisted(() => ({
  projectsState: {
    activeProjectId: null as string | null,
    setActiveProjectIdOnly: vi.fn(),
    projects: [] as { id: string; path: string }[],
  },
}))

vi.mock("@/stores/useProjectsStore", () => ({ useProjectsStore: stubStore(projectsState) }))
vi.mock("@/stores/useMultiRunStore", () => ({
  useMultiRunStore: stubStore({ createMultiRun, error: null, clearError: vi.fn() }),
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
// The real picker is a whole dialog tree; what the launcher needs from it is the model it hands back,
// one add button per run group in the order the groups render.
vi.mock("./ModelMultiSelect", () => ({
  ModelMultiSelect: ({ onAdd }: { onAdd: (model: unknown) => void }) => (
    <button
      type="button"
      data-add-model=""
      onClick={() => {
        addedModels.current += 1
        onAdd({
          providerID: "provider",
          modelID: `model-${addedModels.current}`,
          displayName: `model-${addedModels.current}`,
          instanceId: `instance-${addedModels.current}`,
        })
      }}
    />
  ),
  generateInstanceId: () => {
    instanceIds.current += 1
    return `instance-${instanceIds.current}`
  },
}))
vi.mock("@/components/chat/CommandAutocomplete", () => ({ CommandAutocomplete: () => null }))
vi.mock("@/components/chat/FileMentionAutocomplete", () => ({ FileMentionAutocomplete: () => null }))
vi.mock("@/components/chat/SnippetAutocomplete", () => ({ SnippetAutocomplete: () => null }))

const { MultiRunLauncher } = await import("./MultiRunLauncher")

const escapeEvent = () => {
  const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
  return event
}

const byPlaceholder = (container: HTMLElement, placeholder: string, tag = "textarea") =>
  container.querySelector<HTMLTextAreaElement | HTMLInputElement>(`${tag}[placeholder="${placeholder}"]`)

// React tracks the value it last rendered, so assigning `element.value` directly does not reach it.
const setReactValue = (element: HTMLTextAreaElement | HTMLInputElement, value: string) => {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set
  setter?.call(element, value)
  element.dispatchEvent(new Event("input", { bubbles: true }))
}

const buttonByText = (container: HTMLElement, label: string) =>
  Array.from(container.querySelectorAll("button")).find((button) => button.textContent === label)

describe("MultiRunLauncher", () => {
  let container: HTMLDivElement
  let root: Root
  let onCancel: () => void

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    onCancel = vi.fn()
    projectsState.activeProjectId = null
    projectsState.projects = []
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

describe("MultiRunLauncher run count", () => {
  let container: HTMLDivElement
  let root: Root
  let onCreated: () => void

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    addedModels.current = 0
    createMultiRun.mockReset()
    toastError.mockReset()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    onCreated = vi.fn()
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
          <MultiRunLauncher onCancel={vi.fn()} onCreated={onCreated} />
        </I18nProvider>,
      )
    })
  }

  const typeName = async () => {
    await act(async () => {
      setReactValue(byPlaceholder(container, dict["multirun.launcher.groupName.placeholder"], "input")!, "batch")
    })
  }

  const typePrompt = async (groupIndex: number, text: string) => {
    await act(async () => {
      const prompts = container.querySelectorAll<HTMLTextAreaElement>(
        `textarea[placeholder="${dict["multirun.launcher.groups.prompt.placeholder"]}"]`,
      )
      setReactValue(prompts[groupIndex], text)
    })
  }

  const addModel = async (groupIndex: number) => {
    await act(async () => {
      container.querySelectorAll<HTMLButtonElement>("[data-add-model]")[groupIndex].click()
    })
  }

  const addGroup = async () => {
    await act(async () => {
      buttonByText(container, dict["multirun.launcher.groups.addGroup"])?.click()
    })
  }

  const submit = async () => {
    const form = container.querySelector("form")
    await act(async () => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })
  }

  const startButton = () => container.querySelector<HTMLButtonElement>('button[type="submit"]')!

  test("the start button counts only the groups that will be submitted", async () => {
    await renderLauncher()
    await typeName()
    await typePrompt(0, "review this")
    await addModel(0)
    await addModel(0)

    // A second group with models but no prompt is dropped by handleSubmit, so it must not be counted.
    await addGroup()
    await addModel(1)
    await addModel(1)
    await addModel(1)

    expect(startButton().textContent).toBe(
      dict["multirun.launcher.actions.startWithRunCount"].replace("{count}", "2"),
    )
  })

  // The store reports a run whose session could not be created only in its own log, and still returns a
  // non-null result: the user asked for N runs and silently got fewer, with no lane named anywhere.
  test("a short creation says how many runs started", async () => {
    createMultiRun.mockResolvedValue({ groupSlug: "slug", sessionIds: ["a"], firstSessionId: "a", startedRunCount: 1 })
    await renderLauncher()
    await typeName()
    await typePrompt(0, "review this")
    await addModel(0)
    await addModel(0)

    await submit()

    expect(toastError).toHaveBeenCalledTimes(1)
    expect(toastError.mock.calls[0][0]).toBe(
      dict["multirun.launcher.toast.partialRunsStarted"].replace("{created}", "1").replace("{requested}", "2"),
    )
    expect(onCreated).toHaveBeenCalledTimes(1)
  })

  // A run can be created and still fail to start: the send is a second round trip. Reporting only the
  // created sessions told the user every lane had started.
  test("a run that was created but never started is reported too", async () => {
    createMultiRun.mockResolvedValue({
      groupSlug: "slug",
      sessionIds: ["a", "b"],
      firstSessionId: "a",
      startedRunCount: 1,
    })
    await renderLauncher()
    await typeName()
    await typePrompt(0, "review this")
    await addModel(0)
    await addModel(0)

    await submit()

    expect(toastError.mock.calls[0][0]).toBe(
      dict["multirun.launcher.toast.partialRunsStarted"].replace("{created}", "1").replace("{requested}", "2"),
    )
  })

  test("a complete creation reports nothing", async () => {
    createMultiRun.mockResolvedValue({ groupSlug: "slug", sessionIds: ["a", "b"], firstSessionId: "a", startedRunCount: 2 })
    await renderLauncher()
    await typeName()
    await typePrompt(0, "review this")
    await addModel(0)
    await addModel(0)

    await submit()

    expect(createMultiRun).toHaveBeenCalledTimes(1)
    expect(toastError).not.toHaveBeenCalled()
    expect(onCreated).toHaveBeenCalledTimes(1)
  })

  test("keeps the typed setup commands when the projects store rebuilds its entries", async () => {
    // The projects store rebuilds every entry from the stored list, so the same project arrives as a new object
    // whenever that list is reloaded. The load effect was keyed on that object: a reload reset the commands and
    // discarded what the user had typed, though the project itself had not changed.
    projectsState.activeProjectId = "proj_1"
    projectsState.projects = [{ id: "proj_1", path: "/repo" }]
    await renderLauncher()

    const setupTrigger = Array.from(container.querySelectorAll("button")).find((button) =>
      (button.textContent ?? "").includes(dict["multirun.launcher.setupCommands.label"]),
    )
    expect(setupTrigger).toBeDefined()
    await act(async () => {
      setupTrigger?.click()
    })

    await act(async () => {
      buttonByText(container, dict["multirun.launcher.setupCommands.addCommand"])?.click()
    })
    const input = byPlaceholder(container, dict["multirun.launcher.setupCommands.commandPlaceholder"], "input")
    expect(input).not.toBeNull()
    await act(async () => {
      setReactValue(input!, "pnpm build")
    })

    // The same project, handed over as a new object.
    projectsState.projects = [{ id: "proj_1", path: "/repo" }]
    await act(async () => {
      buttonByText(container, dict["multirun.launcher.setupCommands.addCommand"])?.click()
    })

    const values = Array.from(
      container.querySelectorAll<HTMLInputElement>(
        `input[placeholder="${dict["multirun.launcher.setupCommands.commandPlaceholder"]}"]`,
      ),
    ).map((element) => element.value)
    expect(values).toContain("pnpm build")
  })

})
