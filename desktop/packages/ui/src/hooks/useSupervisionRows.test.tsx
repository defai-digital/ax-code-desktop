import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  sessions: [] as Array<Record<string, unknown>>,
  statuses: {} as Record<string, { type: string }>,
  inputs: [] as Array<Record<string, unknown>>,
}))

vi.mock("@/sync/sync-context", () => ({
  useAllLiveSessions: () => mocks.sessions,
  useAllSessionStatuses: () => mocks.statuses,
}))

vi.mock("@/hooks/useNeedsYouSessions", () => ({
  useNeedsYouSessionInputs: () => mocks.inputs,
  useEnsureDirectoriesGitStatus: () => undefined,
}))

import type { SupervisionRow } from "@/lib/supervision/rows"
import { useSessionGoalStore } from "@/stores/useSessionGoalStore"
import { useSupervisionStore } from "@/stores/useSupervisionStore"
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
    useSessionGoalStore.getState().clear()
    useSupervisionStore.setState({ rows: [] })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    useSessionGoalStore.getState().clear()
    useSupervisionStore.setState({ rows: [] })
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
  })
})
