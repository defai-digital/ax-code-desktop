import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const activity = {
    todo: {} as Record<string, Array<{ status: string; content: string }>>,
    message: {} as Record<string, Array<{ id: string; role: string }>>,
    parts: {} as Record<string, Array<{ type: string; text?: string }>>,
  }
  const listeners = new Set<() => void>()
  const part = { get: (id: string) => activity.parts[id] }
  const store = {
    getState: () => ({ todo: activity.todo, message: activity.message, part }),
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
  return {
    sessions: [] as Array<Record<string, unknown>>,
    statuses: {} as Record<string, { type: string }>,
    inputs: [] as Array<Record<string, unknown>>,
    activity,
    listeners,
    manager: {
      children: new Map([["/repo", store]]),
      subscribeAll: (listener: () => void) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    },
  }
})

vi.mock("@/sync/sync-context", () => ({
  useAllLiveSessions: () => mocks.sessions,
  useAllSessionStatuses: () => mocks.statuses,
  useChildStoreManager: () => mocks.manager,
}))

vi.mock("@/hooks/useNeedsYouSessions", () => ({
  useNeedsYouSessionInputs: () => mocks.inputs,
  useEnsureDirectoriesGitStatus: () => undefined,
}))

import type { SupervisionRow } from "@/lib/supervision/rows"
import { useSessionGoalStore } from "@/stores/useSessionGoalStore"
import { useSupervisionStore } from "@/stores/useSupervisionStore"
import { useProjectsStore } from "@/stores/useProjectsStore"
import { useSupervisionRows, useSupervisionRowsPublisher } from "./useSupervisionRows"

const input = (id: string) => ({
  id,
  projectId: null,
  permissionCount: 0,
  questionCount: 0,
  hasError: false,
  finishedWithUncommitted: false,
  updatedAt: 2000,
  directory: "/repo",
  title: `Session ${id}`,
})

const session = (id: string, parentID?: string) => ({
  id,
  title: `Session ${id}`,
  ...(parentID ? { parentID } : {}),
  time: { created: 1000, updated: 2000 },
})

const goal = (sessionId: string, status: "blocked" | "paused" | "budget_limited") => ({
  sessionId,
  objective: `Objective for ${sessionId}`,
  status,
  tokensUsed: 10,
  timeUsedSeconds: 5,
  createdAt: 1000,
})

describe("useSupervisionRows goal wiring", () => {
  let container: HTMLDivElement
  let root: Root
  let latest: SupervisionRow[] = []

  const Reader: React.FC = () => {
    latest = useSupervisionRows()
    return null
  }

  const Harness: React.FC = () => {
    useSupervisionRowsPublisher()
    return <Reader />
  }

  const render = () => act(() => root.render(<Harness />))

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    mocks.sessions = []
    mocks.statuses = {}
    mocks.inputs = []
    mocks.activity.todo = {}
    mocks.activity.message = {}
    mocks.activity.parts = {}
    mocks.listeners.clear()
    useSessionGoalStore.getState().clear()
    useSupervisionStore.setState({ rows: [] })
    useProjectsStore.setState({ projects: [] })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    useSessionGoalStore.getState().clear()
    useSupervisionStore.setState({ rows: [] })
    useProjectsStore.setState({ projects: [] })
  })

  test("same-label projects publish distinct directory context and update after a rename", () => {
    const projects = [
      { id: "a", label: "Shared", path: "/work/team-a/shared", addedAt: 1 },
      { id: "b", label: "Shared", path: "/work/team-b/shared", addedAt: 1 },
    ]
    useProjectsStore.setState({ projects })
    mocks.sessions = [session("a"), session("b")]
    mocks.inputs = projects.map(project => ({ ...input(project.id), projectId: project.id, directory: project.path }))
    render()
    expect(latest.find(row => row.sessionId === "a")?.projectLabel).toContain("/team-a/shared")
    expect(latest.find(row => row.sessionId === "b")?.projectLabel).toContain("/team-b/shared")
    expect(latest.map(row => row.projectId)).toEqual(expect.arrayContaining(["a", "b"]))
    act(() => useProjectsStore.setState({ projects: projects.map(project => ({
      ...project, label: project.id === "b" ? "Other" : project.label,
    })) }))
    expect(latest.find(row => row.sessionId === "a")?.projectLabel).toBe("Shared")
    expect(latest.find(row => row.sessionId === "b")?.projectLabel).toBe("Other")
  })

  test("a blocked root goal becomes the row state and is shown on the row", () => {
    mocks.sessions = [session("root")]
    mocks.inputs = [input("root")]
    useSessionGoalStore.getState().applyEvent("root", goal("root", "blocked"))
    render()
    expect(latest).toHaveLength(1)
    expect(latest[0]?.state).toBe("goal")
    expect(latest[0]?.goal?.objective).toBe("Objective for root")
  })

  test("a child goal never raises the root state and the row goal stays the root's", () => {
    mocks.sessions = [session("root"), session("child", "root")]
    mocks.inputs = [input("root"), input("child")]
    useSessionGoalStore.getState().applyEvent("child", goal("child", "budget_limited"))
    render()
    expect(latest).toHaveLength(1)
    expect(latest[0]?.sessionId).toBe("root")
    expect(latest[0]?.state).toBe("idle")
    expect(latest[0]?.goal).toBeNull()
  })

  test("a child goal does not hide the root's own paused goal line", () => {
    mocks.sessions = [session("root"), session("child", "root")]
    mocks.inputs = [input("root"), input("child")]
    useSessionGoalStore.getState().applyEvent("root", goal("root", "paused"))
    useSessionGoalStore.getState().applyEvent("child", goal("child", "blocked"))
    render()
    expect(latest).toHaveLength(1)
    expect(latest[0]?.state).toBe("idle")
    expect(latest[0]?.goal?.status).toBe("paused")
    expect(latest[0]?.goal?.objective).toBe("Objective for root")
  })

  test("a retry root with a blocked goal stays running and keeps its goal", () => {
    mocks.sessions = [session("root")]
    mocks.statuses = { root: { type: "retry" } }
    mocks.inputs = [input("root")]
    useSessionGoalStore.getState().applyEvent("root", goal("root", "blocked"))
    render()
    expect(latest[0]?.state).toBe("running")
    expect(latest[0]?.goal?.status).toBe("blocked")
  })

  test("a paused goal is shown on the row without changing its state", () => {
    mocks.sessions = [session("root")]
    mocks.inputs = [input("root")]
    useSessionGoalStore.getState().applyEvent("root", goal("root", "paused"))
    render()
    expect(latest[0]?.state).toBe("idle")
    expect(latest[0]?.goal?.status).toBe("paused")
  })

  test("a running session outranks its blocked goal but still carries it", () => {
    mocks.sessions = [session("root")]
    mocks.statuses = { root: { type: "busy" } }
    mocks.inputs = [input("root")]
    useSessionGoalStore.getState().applyEvent("root", goal("root", "blocked"))
    render()
    expect(latest[0]?.state).toBe("running")
    expect(latest[0]?.goal?.status).toBe("blocked")
  })

  test("a root goal revision folds into the row activity time", () => {
    mocks.sessions = [session("root")]
    mocks.inputs = [{ ...input("root"), updatedAt: 1000 }]
    useSessionGoalStore.getState().applyEvent("root", { ...goal("root", "blocked"), updatedAt: 20000 })
    render()
    expect(latest[0]?.updatedAt).toBe(20000)
    expect(latest[0]?.state).toBe("goal")
  })

  test("a child goal revision does not fold into the root row activity time", () => {
    mocks.sessions = [session("root"), session("child", "root")]
    mocks.inputs = [
      { ...input("root"), updatedAt: 1000 },
      { ...input("child"), updatedAt: 1000 },
    ]
    useSessionGoalStore.getState().applyEvent("child", { ...goal("child", "blocked"), updatedAt: 20000 })
    render()
    expect(latest).toHaveLength(1)
    expect(latest[0]?.updatedAt).toBe(1000)
  })

  test("no goal means a null row goal", () => {
    mocks.sessions = [session("root")]
    mocks.inputs = [input("root")]
    render()
    expect(latest[0]?.goal).toBeNull()
    expect(latest[0]?.state).toBe("idle")
    expect(latest[0]?.activity).toBeNull()
  })

  test("publishes the in-progress todo ahead of a loaded assistant message", () => {
    mocks.sessions = [session("root")]
    mocks.inputs = [input("root")]
    mocks.activity.todo = { root: [{ status: "in_progress", content: "Fix the parser" }] }
    mocks.activity.message = { root: [{ id: "m1", role: "assistant" }] }
    mocks.activity.parts = { m1: [{ type: "text", text: "older words" }] }
    render()
    expect(latest[0]?.activity).toEqual({ kind: "todo", text: "Working on: Fix the parser" })
  })

  test("keeps the same row array when a part update does not change the preview", () => {
    const long = "a".repeat(180)
    mocks.sessions = [session("root")]
    mocks.inputs = [input("root")]
    mocks.activity.message = { root: [{ id: "m1", role: "assistant" }] }
    mocks.activity.parts = { m1: [{ type: "text", text: long }] }
    render()
    const published = useSupervisionStore.getState().rows
    expect(published[0]?.activity?.text.endsWith("…")).toBe(true)
    act(() => {
      mocks.activity.parts = { m1: [{ type: "text", text: `${long} more tokens` }] }
      for (const listener of mocks.listeners) listener()
    })
    expect(useSupervisionStore.getState().rows).toBe(published)
    expect(latest).toBe(published)
    act(() => {
      mocks.activity.parts = { m1: [{ type: "text", text: "done now" }] }
      for (const listener of mocks.listeners) listener()
    })
    expect(latest[0]?.activity).toEqual({ kind: "message", text: "done now" })
    expect(useSupervisionStore.getState().rows).not.toBe(published)
  })
})
