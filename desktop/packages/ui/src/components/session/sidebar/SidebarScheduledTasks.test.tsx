import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"
import { dict } from "@/lib/i18n/messages/en"
import type { ScheduledTask } from "@/lib/scheduledTasksApi"

const { fetchScheduledTasks, createScheduledTasks, setScheduledTasksEnabled, deleteScheduledTasks } = vi.hoisted(
  () => ({
    fetchScheduledTasks: vi.fn(),
    createScheduledTasks: vi.fn(),
    setScheduledTasksEnabled: vi.fn(),
    deleteScheduledTasks: vi.fn(),
  }),
)

vi.mock("@/lib/scheduledTasksApi", () => ({
  fetchScheduledTasks,
  createScheduledTasks,
  deleteScheduledTasks,
  expandPromptSnippets: vi.fn(async (_directory: string, prompt: string) => prompt),
  reconcileScheduledTaskFamily: vi.fn(),
  runScheduledTaskNow: vi.fn(),
  setScheduledTasksEnabled,
}))

// The editor pulls in the provider/agent config stores; the list only needs to open it.
const { editorProps } = vi.hoisted(() => ({
  editorProps: {
    current: null as null | {
      open: boolean
      task: { id: string } | null
      projectLabel?: string
      onSave: (submit: unknown) => Promise<void>
    },
  },
}))
vi.mock("../ScheduledTaskEditorDialog", () => ({
  ScheduledTaskEditorDialog: (props: {
    open: boolean
    task: { id: string } | null
    projectLabel?: string
    onSave: (submit: unknown) => Promise<void>
  }) => {
    editorProps.current = props
    return null
  },
}))

vi.mock("@/contexts/useThemeSystem", () => ({
  useThemeSystem: () => ({
    currentTheme: { metadata: { variant: "dark" }, colors: { surface: { foreground: "#fff" } } },
  }),
}))

const { useProjectsStore } = await import("@/stores/useProjectsStore")
const { useSessionDisplayStore } = await import("@/stores/useSessionDisplayStore")
const { resetScheduledTasksStoreForTests } = await import("@/stores/useScheduledTasksStore")
const { SidebarScheduledTasks } = await import("./SidebarScheduledTasks")

const HOUR = 3_600_000

const task = (overrides: Partial<ScheduledTask> & { id: string; title: string; directory: string }): ScheduledTask => ({
  prompt: "Do it",
  schedule: { type: "daily", time: "09:00", timezone: "UTC" },
  status: "active",
  catchUpPolicy: "run_once",
  lastRunStatus: "idle",
  time: { created: 1 },
  ...overrides,
})

const flush = async () => {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

describe("SidebarScheduledTasks", () => {
  let container: HTMLDivElement
  let root: Root

  const render = async (props: { searchActive?: boolean } = {}) => {
    await act(async () => {
      root.render(
        React.createElement(
          I18nProvider,
          null,
          React.createElement(SidebarScheduledTasks, { searchActive: props.searchActive ?? false }),
        ),
      )
    })
    await flush()
  }

  const rowTitles = () =>
    Array.from(container.querySelectorAll("[data-scheduled-task-row] button span.truncate.typography-ui-label")).map(
      (node) => node.textContent,
    )

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    resetScheduledTasksStoreForTests()
    fetchScheduledTasks.mockReset()
    createScheduledTasks.mockReset()
    setScheduledTasksEnabled.mockReset()
    deleteScheduledTasks.mockReset()
    editorProps.current = null
    useSessionDisplayStore.setState({ showScheduledSection: true, scheduledSectionCollapsed: false })
    useProjectsStore.setState({
      projects: [
        { id: "p-alpha", path: "/work/alpha", label: "Alpha" },
        { id: "p-beta", path: "/work/beta", label: "Beta" },
      ],
      activeProjectId: "p-alpha",
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test("lists every project's tasks in one pending-first queue", async () => {
    const now = Date.now()
    fetchScheduledTasks.mockImplementation(async (directory: string) =>
      directory === "/work/alpha"
        ? [
            task({ id: "a1", directory, title: "Nightly", nextRunAt: now + 5 * HOUR }),
            task({ id: "a2", directory, title: "Paused one", status: "paused" }),
          ]
        : [
            task({ id: "b1", directory, title: "Soon", nextRunAt: now + HOUR }),
            task({ id: "b2", directory, title: "Broken", lastRunStatus: "error", lastRunAt: now - HOUR }),
          ],
    )
    await render()
    expect(fetchScheduledTasks.mock.calls.map(([directory]) => directory).sort()).toEqual(["/work/alpha", "/work/beta"])
    expect(rowTitles()).toEqual(["Broken", "Soon", "Nightly", "Paused one"])
    expect(container.textContent).toContain("Alpha")
    expect(container.textContent).toContain("Beta")
    expect(container.textContent).toContain("1 failing")

    const header = container.querySelector<HTMLButtonElement>("button[aria-expanded]")
    expect(header?.getAttribute("aria-expanded")).toBe("true")
    await act(async () => header?.click())
    expect(useSessionDisplayStore.getState().scheduledSectionCollapsed).toBe(true)
    expect(rowTitles()).toEqual([])
    // Collapsed, the header still says when the next run is.
    expect(container.textContent).toMatch(/Next in/)
  })

  test("opens the editor for a row with its project", async () => {
    fetchScheduledTasks.mockImplementation(async (directory: string) =>
      directory === "/work/beta" ? [task({ id: "b1", directory, title: "Soon" })] : [],
    )
    await render()
    const rowButton = container.querySelector<HTMLButtonElement>("[data-scheduled-task-row] button")
    await act(async () => rowButton?.click())
    expect(editorProps.current?.open).toBe(true)
    expect(editorProps.current?.task?.id).toBe("b1")
    expect(editorProps.current?.projectLabel).toBe("Beta")
  })

  test("an unavailable history stays visible without corrupting another project's running row", async () => {
    fetchScheduledTasks.mockImplementation(async (directory: string) => [
      task({
        id: "same-id",
        directory,
        title: "Nightly",
        lastRunStatus: directory === "/work/alpha" ? "running" : "unknown",
      }),
    ])
    await render()
    const rows = Array.from(container.querySelectorAll("[data-scheduled-task-row]"))
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain("Alpha")
    expect(rows[0].textContent).toContain("Running")
    expect(rows[0].textContent).not.toContain("Couldn't load the run history")
    expect(rows[1].textContent).toContain("Beta")
    expect(rows[1].textContent).toContain("Couldn't load the run history")
  })

  test("hides the list during a session search", async () => {
    fetchScheduledTasks.mockImplementation(async (directory: string) => [
      task({ id: `${directory}-t`, directory, title: "Task" }),
    ])
    await render({ searchActive: true })
    expect(rowTitles()).toEqual([])
    expect(container.querySelector("[data-sidebar-scheduled]")).not.toBeNull()
  })

  test("fetches nothing while the section is hidden", async () => {
    useSessionDisplayStore.setState({ showScheduledSection: false })
    await render()
    expect(fetchScheduledTasks).not.toHaveBeenCalled()
    expect(container.querySelector("[data-sidebar-scheduled]")).toBeNull()
  })

  test("shows a retry row for a project that never loaded", async () => {
    fetchScheduledTasks.mockImplementation(async (directory: string) => {
      if (directory === "/work/beta") throw new Error("runtime down")
      return []
    })
    await render()
    expect(container.textContent).toContain("Couldn't load Beta")
    fetchScheduledTasks.mockImplementation(async (directory: string) => [
      task({ id: "b1", directory, title: "Recovered" }),
    ])
    const retry = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Retry")
    await act(async () => retry?.click())
    await flush()
    expect(container.textContent).not.toContain("Couldn't load Beta")
    expect(rowTitles()).toEqual(["Recovered"])
  })

  test("keeps only the header when no project has tasks", async () => {
    fetchScheduledTasks.mockResolvedValue([])
    await render()
    expect(container.querySelector("[data-sidebar-scheduled]")).not.toBeNull()
    expect(container.querySelector("[data-sidebar-scheduled] ul")).toBeNull()
    const header = container.querySelector<HTMLButtonElement>("button[aria-expanded]")
    expect(header?.getAttribute("aria-controls")).toBeNull()
  })

  const rowText = (title: string) =>
    Array.from(container.querySelectorAll<HTMLElement>("[data-scheduled-task-row]")).find((row) =>
      row.textContent?.startsWith(title),
    )?.textContent ?? ""

  test("rolls a failed pause back even when the reload fails too", async () => {
    fetchScheduledTasks.mockImplementation(async (directory: string) =>
      directory === "/work/alpha"
        ? [task({ id: "a1", directory, title: "Nightly", nextRunAt: Date.now() + HOUR })]
        : [],
    )
    await render()
    setScheduledTasksEnabled.mockRejectedValueOnce(new Error("runtime down"))
    fetchScheduledTasks.mockRejectedValue(new Error("runtime down"))
    const pause = container.querySelector<HTMLButtonElement>('button[aria-label="Pause Nightly"]')
    await act(async () => pause?.click())
    await flush()
    expect(setScheduledTasksEnabled).toHaveBeenCalledWith("/work/alpha", ["a1"], false)
    expect(rowText("Nightly")).not.toContain("Paused")
    expect(container.querySelector('button[aria-label="Pause Nightly"]')).not.toBeNull()
  })

  test("reloads the group when a fan-out create fails, so the list shows what exists", async () => {
    // One project: the add button then opens the new-task editor directly instead of
    // a project picker.
    useProjectsStore.setState({
      projects: [{ id: "p-alpha", path: "/work/alpha", label: "Alpha" }],
      activeProjectId: "p-alpha",
    })
    fetchScheduledTasks.mockImplementation(async (directory: string) => [
      task({ id: `${directory}-1`, directory, title: "Existing" }),
    ])
    await render()

    const newTask = container.querySelector<HTMLButtonElement>(
      `button[aria-label="${dict["sessions.sidebar.scheduled.newTask"]}"]`,
    )
    await act(async () => newTask?.click())
    expect(editorProps.current?.open).toBe(true)

    // The runtime created the task but refused to pause it: it exists and is active.
    createScheduledTasks.mockRejectedValueOnce(new Error("Task was created but could not be paused"))
    fetchScheduledTasks.mockClear()

    await act(async () => {
      await editorProps.current
        ?.onSave({
          enabled: false,
          enabledChanged: true,
          scheduleChanged: true,
          input: {
            name: "Nightly",
            prompt: "Do it",
            catchUpPolicy: "run_once",
            schedule: { kind: "daily", times: ["09:00"], timezone: "UTC" },
          },
        })
        .catch(() => {})
    })
    await flush()

    expect(createScheduledTasks).toHaveBeenCalledTimes(1)
    expect(fetchScheduledTasks).toHaveBeenCalledWith("/work/alpha")
    await act(async () => {
      await expect(
        editorProps.current?.onSave({
          enabled: false,
          enabledChanged: true,
          scheduleChanged: true,
          input: {
            name: "Nightly",
            prompt: "Do it",
            catchUpPolicy: "run_once",
            schedule: { kind: "daily", times: ["09:00"], timezone: "UTC" },
          },
        }),
      ).rejects.toThrow("review the scheduled tasks")
    })
    expect(createScheduledTasks).toHaveBeenCalledTimes(1)
  })

  test("pauses every part the store has now, not the row's snapshot", async () => {
    const part = (index: number, time: string) =>
      task({
        id: `p${index}`,
        directory: "/work/alpha",
        title: `Digest (${index}/2)`,
        schedule: { type: "daily", time, timezone: "UTC" },
      })
    fetchScheduledTasks.mockImplementation(async (directory: string) =>
      directory === "/work/alpha" ? [part(1, "09:00"), part(2, "18:00")] : [],
    )
    await render()
    setScheduledTasksEnabled.mockResolvedValue(undefined)
    const pause = container.querySelector<HTMLButtonElement>('button[aria-label="Pause Digest"]')
    await act(async () => pause?.click())
    await flush()
    expect(setScheduledTasksEnabled).toHaveBeenCalledWith("/work/alpha", ["p1", "p2"], false)
  })

  test("keeps a loading row for a project that has not answered yet", async () => {
    fetchScheduledTasks.mockImplementation((directory: string) =>
      directory === "/work/alpha"
        ? Promise.resolve([task({ id: "a1", directory, title: "Nightly" })])
        : new Promise<ScheduledTask[]>(() => {}),
    )
    await render()
    expect(rowTitles()).toEqual(["Nightly"])
    expect(container.querySelector('[data-sidebar-scheduled] [aria-busy="true"]')).not.toBeNull()
  })

  test("shows a retry row when a refresh fails after a good load", async () => {
    const { useScheduledTasksStore } = await import("@/stores/useScheduledTasksStore")
    fetchScheduledTasks.mockImplementation(async (directory: string) => [
      task({ id: `${directory}-t`, directory, title: "Kept" }),
    ])
    await render()
    fetchScheduledTasks.mockRejectedValue(new Error("runtime down"))
    await act(async () => {
      await useScheduledTasksStore.getState().loadGroup("/work/beta")
    })
    expect(container.textContent).toContain("Couldn't load Beta")
    expect(rowTitles()).toEqual(["Kept", "Kept"])
  })
})
