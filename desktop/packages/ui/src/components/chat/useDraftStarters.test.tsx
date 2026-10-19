import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { DraftStarterRef } from "@/lib/draftStarters"

const projects = vi.hoisted(() => {
  const state = {
    activeProjectId: "proj_a" as string | null,
    projects: [
      { id: "proj_a", path: "/a" },
      { id: "proj_b", path: "/b" },
    ],
  }
  const listeners = new Set<() => void>()
  return {
    state,
    setActiveProject(id: string) {
      state.activeProjectId = id
      for (const listener of listeners) listener()
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
})

const config = vi.hoisted(() => ({
  getProjectDraftStarters: vi.fn(),
  saveProjectDraftStarters: vi.fn(async () => true),
}))

vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))
vi.mock("@/lib/persistence", () => ({ updateDesktopSettings: vi.fn(async () => {}) }))
vi.mock("@/lib/openchamberConfig", () => config)
vi.mock("@/stores/useUIStore", () => {
  const state = { globalDraftStarters: undefined }
  const useUIStore = (selector: (value: typeof state) => unknown) => selector(state)
  Object.assign(useUIStore, { getState: () => ({ setGlobalDraftStarters: vi.fn() }) })
  return { useUIStore }
})
vi.mock("@/stores/useCommandsStore", () => {
  const state = { commands: [] as Array<{ name: string }>, loadCommands: vi.fn(async () => {}) }
  const useCommandsStore = (selector: (value: typeof state) => unknown) => selector(state)
  Object.assign(useCommandsStore, { getState: () => state })
  return { useCommandsStore }
})
vi.mock("@/stores/useSkillsStore", () => {
  const state = { skills: [] as Array<{ name: string }>, loadSkills: vi.fn(async () => {}) }
  const useSkillsStore = (selector: (value: typeof state) => unknown) => selector(state)
  Object.assign(useSkillsStore, { getState: () => state })
  return { useSkillsStore }
})
vi.mock("@/stores/useProjectsStore", async () => {
  const React = await import("react")
  const useProjectsStore = (selector: (value: typeof projects.state) => unknown) =>
    React.useSyncExternalStore(
      projects.subscribe,
      () => selector(projects.state),
      () => selector(projects.state),
    )
  Object.assign(useProjectsStore, { getState: () => projects.state })
  return { useProjectsStore }
})

const { useDraftStarters } = await import("./useDraftStarters")

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const ref = (name: string): DraftStarterRef => ({ type: "command", name })

describe("useDraftStarters project scope", () => {
  let container: HTMLDivElement
  let root: Root
  let latest!: ReturnType<typeof useDraftStarters>

  const Harness = () => {
    latest = useDraftStarters()
    return null
  }

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    projects.state.activeProjectId = "proj_a"
    config.getProjectDraftStarters.mockReset()
    config.saveProjectDraftStarters.mockReset()
    config.saveProjectDraftStarters.mockResolvedValue(true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const render = () => {
    act(() => root.render(<Harness />))
  }

  const settle = async (promise: Promise<unknown>) => {
    await act(async () => {
      await promise
      await Promise.resolve()
    })
  }

  const projectNames = () => latest.project.map((starter) => starter.ref.name)

  test("never persists one project's list into another project before its read settles", async () => {
    const loadA = deferred<DraftStarterRef[]>()
    const loadB = deferred<DraftStarterRef[]>()
    config.getProjectDraftStarters.mockImplementation((project: { id: string }) =>
      project.id === "proj_a" ? loadA.promise : loadB.promise,
    )

    render()
    loadA.resolve([ref("explore"), ref("review")])
    await settle(loadA.promise)
    expect(projectNames()).toEqual(["explore", "review"])

    act(() => projects.setActiveProject("proj_b"))
    // The previous project's list must not be visible (or writable) under B.
    expect(latest.project).toEqual([])

    act(() => {
      latest.removeStarter("project", ref("review"))
      latest.addStarter({
        type: "command",
        name: "debug",
        label: "Debug",
        icon: "bug",
        section: "built-in",
        scope: "project",
      })
    })
    expect(config.saveProjectDraftStarters).not.toHaveBeenCalled()

    loadB.resolve([ref("explore")])
    await settle(loadB.promise)
    expect(projectNames()).toEqual(["explore"])

    act(() => latest.removeStarter("project", ref("explore")))
    expect(config.saveProjectDraftStarters).toHaveBeenCalledTimes(1)
    expect(config.saveProjectDraftStarters).toHaveBeenCalledWith({ id: "proj_b", path: "/b" }, [])
  })

  test("ignores a read that resolves after the selected project changed", async () => {
    const loadA = deferred<DraftStarterRef[]>()
    const loadB = deferred<DraftStarterRef[]>()
    config.getProjectDraftStarters.mockImplementation((project: { id: string }) =>
      project.id === "proj_a" ? loadA.promise : loadB.promise,
    )

    render()
    act(() => projects.setActiveProject("proj_b"))
    loadB.resolve([])
    await settle(loadB.promise)

    loadA.resolve([ref("explore")])
    await settle(loadA.promise)

    expect(projectNames()).toEqual([])
    expect(config.saveProjectDraftStarters).not.toHaveBeenCalled()
  })
})
