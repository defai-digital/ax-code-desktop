import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"
import type { ScheduledTask } from "@/lib/scheduledTasksApi"

const { fetchScheduledTasks } = vi.hoisted(() => ({ fetchScheduledTasks: vi.fn() }))

vi.mock("@/lib/scheduledTasksApi", () => ({
  fetchScheduledTasks,
  createScheduledTasks: vi.fn(),
  deleteScheduledTasks: vi.fn(),
  expandPromptSnippets: vi.fn(async (_directory: string, prompt: string) => prompt),
  reconcileScheduledTaskFamily: vi.fn(),
  runScheduledTaskNow: vi.fn(),
  setScheduledTasksEnabled: vi.fn(),
}))

// The editor pulls in the provider/agent config stores; the list only needs to open it.
const { editorProps } = vi.hoisted(() => ({
  editorProps: { current: null as null | { open: boolean; task: { id: string } | null; projectLabel?: string } },
}))
vi.mock("../ScheduledTaskEditorDialog", () => ({
  ScheduledTaskEditorDialog: (props: { open: boolean; task: { id: string } | null; projectLabel?: string }) => {
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
})
