import React, { act } from "react"
import { render, cleanup } from "@/test/dom"
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
      subscribeRegistry: () => () => {},
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

import { useSessionGoalStore } from "@/stores/useSessionGoalStore"
import { useSupervisionStore } from "@/stores/useSupervisionStore"
import { useProjectsStore } from "@/stores/useProjectsStore"
import { useSupervisionRowsPublisher } from "./useSupervisionRows"

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

const Publisher = () => {
  useSupervisionRowsPublisher()
  return null
}

beforeEach(() => {
  mocks.sessions = [session("root"), session("worker", "root"), session("nested", "worker")]
  mocks.inputs = [
    input("root"),
    { ...input("worker"), title: "  Codex tests  " },
    { ...input("nested"), title: " ", questionCount: 1, updatedAt: 1500 },
  ]
  mocks.statuses = { root: { type: "busy" }, worker: { type: "busy" } }
  mocks.activity.todo = {}
  mocks.activity.message = {}
  mocks.activity.parts = {}
  mocks.listeners.clear()
  useSessionGoalStore.getState().clear()
  useSupervisionStore.setState({ rows: [] })
  useProjectsStore.setState({ projects: [] })
})
afterEach(() => {
  cleanup()
  useSessionGoalStore.getState().clear()
  useSupervisionStore.setState({ rows: [] })
})

describe("published child session summaries", () => {
  test("keeps one root row while publishing all descendants with their own state and activity time", () => {
    const { rerender } = render(<Publisher />)
    const rows = useSupervisionStore.getState().rows
    expect(rows).toHaveLength(1)
    expect(rows[0].state).toBe("question")
    expect(rows[0].treeSessionIds).toEqual(["root", "worker", "nested"])
    expect(rows[0].childSessions).toEqual([
      { sessionId: "worker", title: "Codex tests", state: "running", updatedAt: 2000 },
      { sessionId: "nested", title: "nested", state: "question", updatedAt: 1500 },
    ])
    mocks.statuses = { root: { type: "busy" }, worker: { type: "idle" } }
    rerender(<Publisher />)
    expect(useSupervisionStore.getState().rows[0].childSessions?.[0].state).toBe("idle")
    expect(useSupervisionStore.getState().rows[0].state).toBe("question")
  })

  test("shows a child's blocked goal on that child without raising the root's state", () => {
    mocks.inputs = [input("root"), input("worker")]
    mocks.sessions = [session("root"), session("worker", "root")]
    mocks.statuses = {}
    render(<Publisher />)
    act(() => useSessionGoalStore.getState().applyEvent("worker", goal("worker", "blocked")))
    expect(useSupervisionStore.getState().rows[0].state).toBe("idle")
    expect(useSupervisionStore.getState().rows[0].childSessions?.[0].state).toBe("goal")
  })
  test("a child's blocked goal does not hide its uncommitted changes from the existing root rollup", () => {
    mocks.inputs = [input("root"), { ...input("worker"), finishedWithUncommitted: true }]
    mocks.sessions = [session("root"), session("worker", "root")]
    mocks.statuses = {}
    render(<Publisher />)
    act(() => useSessionGoalStore.getState().applyEvent("worker", goal("worker", "blocked")))
    expect(useSupervisionStore.getState().rows[0].state).toBe("review")
    expect(useSupervisionStore.getState().rows[0].childSessions?.[0].state).toBe("goal")
  })
})
