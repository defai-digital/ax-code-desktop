import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"
import { createDesktopUiTools } from "@/lib/desktopUiWebMcp"

const fixtures = vi.hoisted(() => ({
  projects: [
    { id: "a", path: "/work/team-a/shared", label: "Shared", pinned: false },
    { id: "b", path: "/work/team-b/shared", label: "Shared", pinned: false },
  ],
  activeProjectId: "a", setActiveProject: vi.fn(), setProjectPinned: vi.fn(), setCurrentSession: vi.fn(),
  setActiveMainTab: vi.fn(), worktreeMetadata: new Map(), shortcutOverrides: {},
  sessions: [
    { id: "session-a", directory: "/work/team-a/shared", time: { created: 1, updated: 2 } },
    { id: "session-b", directory: "/work/team-b/shared", time: { created: 1, updated: 2 } },
  ],
  statuses: {}, permissions: new Set<string>(),
}))
vi.mock("@/stores/useProjectsStore", () => ({ useProjectsStore: (select: (state: typeof fixtures) => unknown) => select(fixtures) }))
vi.mock("@/stores/useDirectoryStore", () => ({ useDirectoryStore: (select: (state: { homeDirectory: string }) => unknown) => select({ homeDirectory: "/work" }) }))
vi.mock("@/stores/useUIStore", () => ({ useUIStore: (select: (state: typeof fixtures) => unknown) => select(fixtures) }))
vi.mock("@/sync/session-ui-store", () => ({ useSessionUIStore: (select: (state: typeof fixtures) => unknown) => select(fixtures) }))
vi.mock("@/sync/sync-context", () => ({
  useAllLiveSessions: () => fixtures.sessions, useAllSessionStatuses: () => fixtures.statuses,
  usePendingPermissionSessionIds: () => fixtures.permissions,
}))
vi.mock("@/hooks/useNeedsYouSessions", () => ({
  useNeedsYouSessionInputs: () => fixtures.projects.map(project => ({
    id: `session-${project.id}`, projectId: project.id, directory: project.path,
    permissionCount: 0, questionCount: 1, hasError: false, finishedWithUncommitted: false,
  })),
  useEnsureDirectoriesGitStatus: () => {},
}))
vi.mock("@/stores/useGlobalSessionsStore", () => ({ resolveGlobalSessionDirectory: (session: { directory: string }) => session.directory }))
vi.mock("@/contexts/useThemeSystem", () => ({
  useThemeSystem: () => ({ currentTheme: { metadata: { variant: "dark" }, colors: { surface: { foreground: "#fff" } } } }),
}))
vi.mock("./NeedsYouQueue", () => ({ NeedsYouQueue: () => null }))
vi.mock("./ImportProjectsDialog", () => ({ ImportProjectsDialog: () => null }))

import { ProjectsHome } from "./ProjectsHome"

let root: Root
let container: HTMLDivElement
const open = vi.fn()
const draft = vi.fn()
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList)
  fixtures.projects.forEach(project => { project.label = "Shared"; project.pinned = false })
  fixtures.activeProjectId = "a"
  vi.clearAllMocks()
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})
const render = (compact = false) => act(() => root.render(
  <I18nProvider><ProjectsHome compact={compact} variant="draft" onOpenProject={open} onNewSession={draft} /></I18nProvider>,
))
const card = (path: string) => Array.from(container.querySelectorAll<HTMLElement>("[data-project-row]")).find(row => row.querySelector(".font-mono")?.textContent === path)!
const clickNative = (name: string) => {
  const { tools, dispose } = createDesktopUiTools(document)
  try {
    const state = tools[0].execute({}) as { controls: Array<{ ref: string; name: string }> }
    const matches = state.controls.filter(control => control.name === name)
    expect(matches).toHaveLength(1)
    act(() => { tools[1].execute({ ref: matches[0].ref }) })
  } finally { dispose() }
}

test("duplicate card names retain distinct paths and open their exact project", () => {
  render()
  for (const [id, path] of [["b", "~/team-b/shared"], ["a", "~/team-a/shared"]]) {
    clickNative(`Shared · ${path}`)
    expect(open).toHaveBeenLastCalledWith(id)
    expect(fixtures.setActiveProject).toHaveBeenLastCalledWith(id)
  }
  expect(card("~/team-a/shared").getAttribute("aria-current")).toBe("true")
  expect(card("~/team-b/shared").getAttribute("aria-current")).toBeNull()
})

test("pin and draft actions carry project context and do not also open the card", () => {
  render()
  clickNative("Pin project · Shared · ~/team-b/shared")
  expect(fixtures.setProjectPinned).toHaveBeenLastCalledWith("b", true)
  expect(open).not.toHaveBeenCalled()
  expect(fixtures.setActiveProject).not.toHaveBeenCalled()
  clickNative("New session · Shared · ~/team-a/shared")
  expect(draft).toHaveBeenLastCalledWith("a")
  expect(fixtures.setActiveProject).toHaveBeenLastCalledWith("a")
  expect(open).not.toHaveBeenCalled()
  fixtures.projects[1].pinned = true
  render()
  clickNative("Unpin project · Shared · ~/team-b/shared")
  expect(fixtures.setProjectPinned).toHaveBeenLastCalledWith("b", false)
})

test("compact attention controls remain named and open their own session without card navigation", () => {
  render(true)
  clickNative("1 need you · Shared · ~/team-b/shared")
  expect(fixtures.setCurrentSession).toHaveBeenLastCalledWith("session-b", "/work/team-b/shared")
  expect(fixtures.setActiveProject).toHaveBeenLastCalledWith("b")
  expect(fixtures.setActiveMainTab).toHaveBeenLastCalledWith("chat")
  expect(open).not.toHaveBeenCalled()
})

test("unique titles stay concise and a label colliding with another rendered path is disambiguated", () => {
  fixtures.projects[0].label = "Unique"
  fixtures.projects[1].label = ""
  render()
  expect(card("~/team-a/shared").getAttribute("aria-label")).toBe("Unique")
  fixtures.projects[0].label = "~/team-b/shared"
  fixtures.projects = [...fixtures.projects]
  render()
  expect(card("~/team-a/shared").getAttribute("aria-label")).toBe("~/team-b/shared · ~/team-a/shared")
  expect(card("~/team-b/shared").getAttribute("aria-label")).toBe("~/team-b/shared · ~/team-b/shared")
})

test("labels that differ only by collapsed display whitespace keep distinct native names", () => {
  fixtures.projects[0].label = "Shared  project"
  fixtures.projects[1].label = "Shared project"
  render()
  clickNative("Shared project · ~/team-a/shared")
  expect(open).toHaveBeenLastCalledWith("a")
  clickNative("Shared project · ~/team-b/shared")
  expect(open).toHaveBeenLastCalledWith("b")
})
