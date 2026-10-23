import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  sessions: [] as Array<Record<string, unknown>>,
  statuses: {} as Record<string, { type: string }>,
  pendingPermissions: new Set<string>(),
  pendingQuestions: new Set<string>(),
}))

vi.mock("@/sync/sync-context", () => ({
  useAllLiveSessions: () => mocks.sessions,
  useAllSessionStatuses: () => mocks.statuses,
  usePendingPermissionSessionIds: () => mocks.pendingPermissions,
  usePendingQuestionSessionIds: () => mocks.pendingQuestions,
}))

import {
  attentionSessionForProject,
  listNeedsYouSessions,
  sessionNeedsSwitcherAttention,
  type NeedsYouSessionInput,
} from "@/lib/needsYou"
import { useGitStore } from "@/stores/useGitStore"
import { useSessionGoalStore } from "@/stores/useSessionGoalStore"
import { useRunStateStore } from "@/sync/run-state-store"
import { useNeedsYouSessionInputs } from "./useNeedsYouSessions"

const session = (id: string, parentID?: string) => ({
  id,
  title: `Session ${id}`,
  directory: "/repo",
  ...(parentID ? { parentID } : {}),
  time: { created: 1000, updated: 2000 },
})

const blockedGoal = (sessionId: string) => ({
  sessionId,
  objective: "Ship the migration",
  status: "blocked" as const,
  tokensUsed: 10,
  timeUsedSeconds: 5,
  createdAt: 1000,
})

describe("useNeedsYouSessionInputs goal wiring", () => {
  let container: HTMLDivElement
  let root: Root
  let latest: NeedsYouSessionInput[] = []

  const Harness: React.FC = () => {
    latest = useNeedsYouSessionInputs()
    return null
  }

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    mocks.sessions = [session("s-blocked"), session("s-paused"), session("s-none")]
    mocks.statuses = {}
    mocks.pendingPermissions = new Set()
    mocks.pendingQuestions = new Set()
    useSessionGoalStore.getState().clear()
    useSessionGoalStore.getState().applyEvent("s-blocked", {
      sessionId: "s-blocked",
      objective: "Ship the migration",
      status: "blocked",
      tokensUsed: 10,
      timeUsedSeconds: 5,
      createdAt: 1000,
    })
    useSessionGoalStore.getState().applyEvent("s-paused", {
      sessionId: "s-paused",
      objective: "Ship the migration",
      status: "paused",
      tokensUsed: 10,
      timeUsedSeconds: 5,
      createdAt: 1000,
    })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    useSessionGoalStore.getState().clear()
  })

  test("marks only blocked or budget-limited goals as needing a person and carries the snapshot", () => {
    act(() => root.render(<Harness />))
    const byId = new Map(latest.map((input) => [input.id, input]))
    expect(byId.get("s-blocked")?.goalNeedsPerson).toBe(true)
    expect(byId.get("s-blocked")?.goal?.status).toBe("blocked")
    expect(byId.get("s-paused")?.goalNeedsPerson).toBe(false)
    expect(byId.get("s-paused")?.goal?.status).toBe("paused")
    expect(byId.get("s-none")?.goalNeedsPerson).toBe(false)
    expect(byId.get("s-none")?.goal).toBeNull()
  })

  test("a busy or retry session with a blocked goal does not need a person but keeps its goal", () => {
    mocks.sessions = [session("s-busy"), session("s-retry"), session("s-idle-goal")]
    mocks.statuses = {
      "s-busy": { type: "busy" },
      "s-retry": { type: "retry" },
      "s-idle-goal": { type: "idle" },
    }
    useSessionGoalStore.getState().applyEvent("s-busy", blockedGoal("s-busy"))
    useSessionGoalStore.getState().applyEvent("s-retry", blockedGoal("s-retry"))
    useSessionGoalStore.getState().applyEvent("s-idle-goal", blockedGoal("s-idle-goal"))
    act(() => root.render(<Harness />))
    const byId = new Map(latest.map((input) => [input.id, input]))
    expect(byId.get("s-busy")?.goalNeedsPerson).toBe(false)
    expect(byId.get("s-busy")?.goal?.status).toBe("blocked")
    expect(byId.get("s-retry")?.goalNeedsPerson).toBe(false)
    expect(byId.get("s-retry")?.goal?.status).toBe("blocked")
    expect(byId.get("s-idle-goal")?.goalNeedsPerson).toBe(true)
    // The surfaces that consume the shared input agree: no queue entry, no
    // project attention and no switcher attention for the running sessions.
    expect(listNeedsYouSessions(latest).map((entry) => entry.sessionId)).toEqual(["s-idle-goal"])
    const forProject = latest.map((input) => ({ ...input, projectId: "app" }))
    expect(attentionSessionForProject("app", forProject)).toBe("s-idle-goal")
    expect(sessionNeedsSwitcherAttention(byId.get("s-busy")!)).toBe(false)
    expect(sessionNeedsSwitcherAttention(byId.get("s-retry")!)).toBe(false)
    expect(sessionNeedsSwitcherAttention(byId.get("s-idle-goal")!)).toBe(true)
  })

  test("only a root session's blocked goal needs a person; a child's never does", () => {
    mocks.sessions = [session("root"), session("child", "root"), session("orphan", "gone")]
    mocks.statuses = {}
    useSessionGoalStore.getState().applyEvent("root", blockedGoal("root"))
    useSessionGoalStore.getState().applyEvent("child", blockedGoal("child"))
    useSessionGoalStore.getState().applyEvent("orphan", blockedGoal("orphan"))
    act(() => root.render(<Harness />))
    const byId = new Map(latest.map((input) => [input.id, input]))
    expect(byId.get("root")?.goalNeedsPerson).toBe(true)
    expect(byId.get("child")?.goalNeedsPerson).toBe(false)
    expect(byId.get("child")?.goal?.status).toBe("blocked")
    // An orphan whose parent is not loaded is the top of its loaded tree.
    expect(byId.get("orphan")?.goalNeedsPerson).toBe(true)
    expect(listNeedsYouSessions(latest).map((entry) => entry.sessionId)).toEqual(["root", "orphan"])
  })
})

describe("useNeedsYouSessionInputs finished work", () => {
  let container: HTMLDivElement
  let root: Root
  let latest: NeedsYouSessionInput[] = []

  const Harness: React.FC = () => {
    latest = useNeedsYouSessionInputs()
    return null
  }

  const withChanges = (id: string) => ({ ...session(id), summary: { additions: 4, deletions: 1, files: 2 } })
  const setDirty = (dirtyTree: boolean) =>
    useGitStore.setState({ directories: new Map([["/repo", { status: { isClean: !dirtyTree, files: [] } }]]) as never })
  const uncommitted = (id: string) => latest.find((input) => input.id === id)?.finishedWithUncommitted

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    mocks.sessions = []
    mocks.statuses = {}
    mocks.pendingPermissions = new Set()
    mocks.pendingQuestions = new Set()
    useSessionGoalStore.getState().clear()
    useRunStateStore.setState({ runEndedAt: { done: 2000, quiet: 2000, other: 2000 }, nudgeDismissedAt: {} })
    setDirty(false)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    useRunStateStore.setState({ runEndedAt: {}, nudgeDismissedAt: {} })
    useGitStore.setState({ directories: new Map() })
  })

  test("finished work counts only when the session reported changes of its own and the directory is dirty", () => {
    mocks.sessions = [withChanges("done"), session("quiet")]
    setDirty(false)
    act(() => root.render(<Harness />))
    expect(uncommitted("done")).toBe(false)

    setDirty(true)
    act(() => root.render(<Harness />))
    expect(uncommitted("done")).toBe(true)
    // A dirty directory says nothing about a session that never reported a change: the user's own edits or a
    // sibling session may have made it dirty.
    expect(uncommitted("quiet")).toBe(false)
  })

  test("when the runtime names the files, a dirty tree of other files does not count", () => {
    const named = (id: string, file: string) => ({ ...session(id), summary: { files: 1, diffs: [{ file, additions: 2 }] } })
    mocks.sessions = [named("done", "src/mine.ts"), named("quiet", "src/other.ts")]
    useGitStore.setState({
      directories: new Map([["/repo", { status: { isClean: false, files: [{ path: "src/mine.ts" }] } }]]) as never,
    })
    act(() => root.render(<Harness />))
    expect(uncommitted("done")).toBe(true)
    // Its own file was committed; the tree is dirty only because of someone else's change.
    expect(uncommitted("quiet")).toBe(false)
  })

  test("a session whose run never ended is not finished work", () => {
    mocks.sessions = [withChanges("fresh")]
    setDirty(true)
    act(() => root.render(<Harness />))
    expect(uncommitted("fresh")).toBe(false)
  })

  test("a dismissal holds until the next run ends", () => {
    mocks.sessions = [withChanges("done")]
    setDirty(true)
    act(() => root.render(<Harness />))
    expect(uncommitted("done")).toBe(true)

    act(() => useRunStateStore.setState({ nudgeDismissedAt: { done: 3000 } }))
    expect(uncommitted("done")).toBe(false)

    // The same run-ended rule the in-session nudge follows: a later run ending shows it again.
    act(() => useRunStateStore.setState({ runEndedAt: { done: 4000 } }))
    expect(uncommitted("done")).toBe(true)
  })
})
