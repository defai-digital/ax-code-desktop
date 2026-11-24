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
import { useSupervisionStore } from "@/stores/useSupervisionStore"
import { useWebMcpBrowserStore } from "@/stores/useWebMcpBrowserStore"
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

test("the home heading shows the count the titlebar pill and the dock badge show", () => {
  type Row = ReturnType<typeof useSupervisionStore.getState>["rows"][number]
  type Views = ReturnType<typeof useWebMcpBrowserStore.getState>["views"]
  const waitingPage = { browserId: "b1", directory: "/waiting", sessionID: "ses_waiting", waiting: true, visible: false }
  fixtures.pages = [{ key: viewKeyFor("/waiting", "ses_waiting"), sessionID: "ses_waiting", waiting: true, visible: false }]
  try {
    act(() => {
      useSupervisionStore.setState({
        rows: [
          { sessionId: "session-a", directory: "/work/team-a/shared", state: "question" },
          { sessionId: "session-b", directory: "/work/team-b/shared", state: "question" },
        ] as unknown as Row[],
      })
      useWebMcpBrowserStore.setState({ views: { [viewKeyFor("/waiting", "ses_waiting")]: waitingPage } as unknown as Views })
    })
    render()
    // Two sessions and a waiting page.
    expect(container.querySelector("h2")?.nextElementSibling?.textContent).toBe("3")
    const projects = fixtures.projects
    fixtures.projects = []
    try {
      act(() => useSupervisionStore.setState({ rows: [] }))
      render()
      // With no session waiting, the page alone keeps the section and its count.
      expect(container.querySelector("h2")?.nextElementSibling?.textContent).toBe("1")
    } finally {
      fixtures.projects = projects
    }
  } finally {
    useSupervisionStore.setState({ rows: [] })
    useWebMcpBrowserStore.setState({ views: {} })
  }
})
