import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import type { Session } from "@defai-digital/ax-code-sdk/v2"
import { useProjectArchiveActions } from "./useProjectArchiveActions"
import { useProjectSessionLists } from "./useProjectSessionLists"

const session = (id: string, directory: string, extra: Partial<Session> = {}): Session =>
  ({
    id,
    directory,
    title: id,
    ...extra,
  }) as Session
const projects = [
  { id: "a", label: "Shared", normalizedPath: "/repo" },
  { id: "b", label: "Shared", normalizedPath: "/repo/nested" },
  { id: "empty", normalizedPath: "/empty" },
]
const worktrees = new Map([["/repo", [{ path: "/worktrees/a" }]]])
let root: Root
let sessions: Session[]
let ready: boolean
let showConfirmation: boolean
let projectReady: boolean
let actions: ReturnType<typeof useProjectArchiveActions>
const archive = vi.fn()
function Probe() {
  const lists = useProjectSessionLists({
    sessions,
    archivedSessions: [],
    availableWorktreesByProject: worktrees,
    allProjectRoots: projects.map((project) => project.normalizedPath),
  })
  actions = useProjectArchiveActions({
    projects,
    getSessionsForProject: lists.getSessionsForProject,
    inventoryReady: ready,
    showConfirmation,
    archiveSessions: archive,
    isProjectReady: () => projectReady,
  })
  return null
}
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  sessions = [
    ...Array.from({ length: 300 }, (_, i) => session(`root-${i}`, "/repo")),
    session("subagent", "/repo", { parentID: "root-0" }),
    session("subfolder", "/repo/src"),
    session("worktree", "/worktrees/a"),
    session("already-archived", "/repo", { time: { created: 1, updated: 1, archived: 2 } }),
    session("nested-project", "/repo/nested"),
    session("other-project", "/repo2"),
  ]
  ready = true
  projectReady = true
  showConfirmation = true
  archive.mockClear()
  root = createRoot(document.createElement("div"))
  act(() => root.render(<Probe />))
})
afterEach(() => act(() => root.unmount()))

test("archives every owned session including hidden rows, worktrees and subagents, excluding other projects", () => {
  act(() => actions.archiveProject("a"))
  expect(archive).not.toHaveBeenCalled()
  expect(actions.confirmation?.projectName).toBe("Shared (/repo)")
  expect(actions.confirmation?.sessions).toHaveLength(303)
  act(() => actions.confirmArchiveProject())
  const ids = archive.mock.calls[0][0].map((entry: Session) => entry.id)
  expect(ids).toContain("root-299")
  expect(ids).toEqual(expect.arrayContaining(["subagent", "subfolder", "worktree"]))
  for (const other of ["already-archived", "nested-project", "other-project"]) expect(ids).not.toContain(other)
  expect(new Set(ids).size).toBe(303)
  expect(archive).toHaveBeenCalledTimes(1)
  expect(actions.confirmation).toBeNull()
})

test("confirmation keeps the original project membership when inventory changes before confirming", () => {
  act(() => actions.archiveProject("b"))
  expect(actions.confirmation?.projectName).toBe("Shared (/repo/nested)")
  sessions = [session("later-session", "/repo/nested"), session("root-later", "/repo")]
  act(() => root.render(<Probe />))
  act(() => actions.confirmArchiveProject())
  expect(archive.mock.calls[0][0].map((entry: Session) => entry.id)).toEqual(["nested-project"])
})

test("cancel never archives, and incomplete inventories, unknown and empty projects have no action", () => {
  expect(actions.canArchiveProject("a")).toBe(true)
  expect(actions.canArchiveProject("empty")).toBe(false)
  expect(actions.canArchiveProject("unknown")).toBe(false)
  act(() => actions.archiveProject("a"))
  act(() => actions.setConfirmation(null))
  act(() => actions.confirmArchiveProject())
  expect(archive).not.toHaveBeenCalled()
  ready = false
  act(() => root.render(<Probe />))
  expect(actions.canArchiveProject("a")).toBe(false)
  act(() => actions.archiveProject("a"))
  expect(actions.confirmation).toBeNull()
  expect(archive).not.toHaveBeenCalled()
  ready = true
  projectReady = false
  act(() => root.render(<Probe />))
  expect(actions.canArchiveProject("a")).toBe(false)
  act(() => actions.archiveProject("a"))
  expect(archive).not.toHaveBeenCalled()
})

test("honors the existing no-confirmation preference and never rearchives an archived-only project", () => {
  showConfirmation = false
  act(() => root.render(<Probe />))
  act(() => actions.archiveProject("b"))
  expect(archive.mock.calls[0][0].map((entry: Session) => entry.id)).toEqual(["nested-project"])
  expect(actions.confirmation).toBeNull()
  sessions = [session("old", "/repo", { time: { created: 1, updated: 1, archived: 2 } })]
  act(() => root.render(<Probe />))
  expect(actions.canArchiveProject("a")).toBe(false)
  act(() => actions.archiveProject("a"))
  expect(archive).toHaveBeenCalledTimes(1)
})
