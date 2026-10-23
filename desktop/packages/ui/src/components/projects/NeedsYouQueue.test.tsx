import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, test, vi } from "vitest"

const fixtures = vi.hoisted(() => ({
  projects: [
    { id: "a", path: "/work/team-a/shared", label: "Shared" },
    { id: "b", path: "/work/team-b/shared", label: "Shared" },
  ],
  open: vi.fn(),
  pages: [] as { key: string; sessionID: string; waiting: boolean; visible: boolean }[],
}))
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock("@/stores/useProjectsStore", () => ({
  useProjectsStore: (select: (state: { projects: typeof fixtures.projects }) => unknown) => select(fixtures),
}))
vi.mock("@/stores/useDirectoryStore", () => ({
  useDirectoryStore: (select: (state: { homeDirectory: string }) => unknown) => select({ homeDirectory: "/work" }),
}))
vi.mock("@/hooks/useNeedsYouSessions", () => ({
  useNeedsYouSessionInputs: () =>
    fixtures.projects.map((project) => ({
      id: `session-${project.id}`,
      projectId: project.id,
      directory: project.path,
      title: "Review the result",
      permissionCount: 0,
      questionCount: 1,
      hasError: false,
      finishedWithUncommitted: false,
    })),
  useEnsureDirectoriesGitStatus: () => {},
}))
vi.mock("@/sync/sync-context", () => ({ useAllPendingRequests: () => [] }))
vi.mock("@/lib/supervision/openSession", () => ({ openSupervisedSession: fixtures.open }))
vi.mock("@/hooks/useWebMcpPages", () => ({ useWebMcpPages: () => fixtures.pages }))
vi.mock("@/components/mcp/WebMcpPages", () => ({ WebMcpWaitingPages: () => null }))
vi.mock("@/components/icon/Icon", () => ({ Icon: () => null }))
vi.mock("@/components/supervision/SupervisionGoalLine", () => ({ SupervisionGoalLine: () => null }))
vi.mock("@/components/supervision/RequestActionCard", () => ({ RequestActionCard: () => null }))

import { viewKeyFor } from "@/lib/webMcpViewKey"
import { NeedsYouQueue } from "./NeedsYouQueue"

let root: Root
let container: HTMLDivElement
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  fixtures.projects.forEach((project) => {
    project.label = "Shared"
  })
  fixtures.open.mockClear()
  container = document.createElement("div")
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  fixtures.pages = []
})
const render = () => act(() => root.render(<NeedsYouQueue />))
const rows = () => Array.from(container.querySelectorAll<HTMLButtonElement>("button[data-needs-you-reason]"))

test("duplicate project labels retain distinct directory context beside same-name tasks", () => {
  render()
  expect(rows()).toHaveLength(2)
  expect(rows()[0].textContent).toContain("~/team-a/shared")
  expect(rows()[1].textContent).toContain("~/team-b/shared")
  expect(rows()[0].textContent).not.toContain("~/team-b/shared")
})

test("opening either same-name task preserves the corresponding session, project and directory", () => {
  render()
  act(() => rows()[1].click())
  expect(fixtures.open).toHaveBeenLastCalledWith({
    sessionId: "session-b",
    projectId: "b",
    directory: "/work/team-b/shared",
  })
  act(() => rows()[0].click())
  expect(fixtures.open).toHaveBeenLastCalledWith({
    sessionId: "session-a",
    projectId: "a",
    directory: "/work/team-a/shared",
  })
})

test("unlabelled projects fall back to their directory while unique labels stay concise", () => {
  fixtures.projects[0].label = ""
  fixtures.projects[1].label = "Unique project"
  render()
  expect(rows()[0].textContent).toContain("~/team-a/shared")
  expect(rows()[1].textContent).toContain("Unique project")
  expect(rows()[1].textContent).not.toContain("/team-b/shared")
})

test("home header includes waiting pages alongside queue rows and when the queue is empty", () => {
  fixtures.pages = [
    { key: viewKeyFor("/waiting", "ses_waiting"), sessionID: "ses_waiting", waiting: true, visible: false },
  ]
  render()
  expect(container.querySelector("h2")?.nextElementSibling?.textContent).toBe("3")
  const projects = fixtures.projects
  fixtures.projects = []
  try {
    render()
    expect(container.querySelector("h2")?.nextElementSibling?.textContent).toBe("1")
  } finally {
    fixtures.projects = projects
  }
})
