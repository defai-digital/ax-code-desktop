import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const { updateDesktopSettings } = vi.hoisted(() => ({
  updateDesktopSettings: vi.fn<(changes: Record<string, unknown>) => Promise<void>>(async () => {}),
}))

vi.mock("@/lib/persistence", () => ({ updateDesktopSettings }))

const { projects } = vi.hoisted(() => ({ projects: [{ id: "proj_1", name: "One" }] }))

vi.mock("@/stores/useProjectsStore", () => ({
  useProjectsStore: { getState: () => ({ projects }) },
}))

const { useSidebarPersistence } = await import("./useSidebarPersistence")

const keys = {
  sessionExpanded: "sessionExpanded",
  sessionExpandedLegacy: "sessionExpanded.v1",
  projectCollapse: "projectCollapse",
  sessionPinned: "sessionPinned",
  groupOrder: "groupOrder",
  projectActiveSession: "projectActiveSession",
  groupCollapse: "groupCollapse",
}

const buildArgs = () => ({
  hasLoadedGlobalSessions: true,
  safeStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  },
  keys,
  sessions: [],
  pinnedSessionIds: new Set<string>(),
  setPinnedSessionIds: () => {},
  groupOrderByProject: new Map<string, string[]>(),
  activeSessionByProject: new Map<string, string>(),
  collapsedGroups: new Set<string>(),
  setExpandedParents: () => {},
  setCollapsedProjects: () => {},
})

describe("useSidebarPersistence", () => {
  let container: HTMLDivElement
  let root: Root
  let schedule: ((collapsed: Set<string>) => void) | null = null

  const Probe = () => {
    schedule = useSidebarPersistence(buildArgs() as never).scheduleCollapsedProjectsPersist
    return null
  }

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    updateDesktopSettings.mockClear()
    schedule = null
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  test("persists a collapse after the debounce window", () => {
    vi.useFakeTimers()
    act(() => root.render(React.createElement(Probe)))
    act(() => schedule?.(new Set(["proj_1"])))
    expect(updateDesktopSettings).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(700)
    })
    expect(updateDesktopSettings).toHaveBeenCalledTimes(1)
  })

  test("persists a pending collapse when the sidebar unmounts inside the debounce", () => {
    // Regression: the teardown cleared the timer and the pending set without
    // flushing, so collapsing a project and closing the window right after lost the
    // change.
    vi.useFakeTimers()
    act(() => root.render(React.createElement(Probe)))
    act(() => schedule?.(new Set(["proj_1"])))
    expect(updateDesktopSettings).not.toHaveBeenCalled()

    act(() => root.unmount())

    expect(updateDesktopSettings).toHaveBeenCalledTimes(1)
    expect(updateDesktopSettings.mock.calls[0][0]).toMatchObject({
      projects: [{ id: "proj_1", sidebarCollapsed: true }],
    })
  })
})
