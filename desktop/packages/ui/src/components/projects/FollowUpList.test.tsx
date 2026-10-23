import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, test, vi } from "vitest"

const fixtures = vi.hoisted(() => ({
  inputs: [] as Array<Record<string, unknown>>,
  open: vi.fn(),
  dismissNudge: vi.fn(),
  markSessionViewed: vi.fn(),
}))
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock("@/stores/useProjectsStore", () => ({
  useProjectsStore: (select: (state: { projects: unknown[] }) => unknown) =>
    select({ projects: [{ id: "app", path: "/work/app", label: "App" }] }),
}))
vi.mock("@/stores/useDirectoryStore", () => ({
  useDirectoryStore: (select: (state: { homeDirectory: string }) => unknown) => select({ homeDirectory: "/work" }),
}))
vi.mock("@/hooks/useNeedsYouSessions", () => ({
  useNeedsYouSessionInputs: () => fixtures.inputs,
  useEnsureDirectoriesGitStatus: () => {},
}))
vi.mock("@/lib/supervision/openSession", () => ({ openSupervisedSession: fixtures.open }))
vi.mock("@/sync/run-state-store", () => ({
  useRunStateStore: (select: (state: { dismissNudge: typeof fixtures.dismissNudge }) => unknown) =>
    select({ dismissNudge: fixtures.dismissNudge }),
}))
vi.mock("@/sync/notification-store", () => ({
  useSyncNotificationStore: (select: (state: { markSessionViewed: typeof fixtures.markSessionViewed }) => unknown) =>
    select({ markSessionViewed: fixtures.markSessionViewed }),
}))
vi.mock("@/components/icon/Icon", () => ({ Icon: () => null }))

import { FollowUpList } from "./FollowUpList"

const input = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  projectId: "app",
  directory: "/work/app",
  title: `Session ${id}`,
  permissionCount: 0,
  questionCount: 0,
  hasError: false,
  finishedWithUncommitted: false,
  ...overrides,
})

let root: Root
let container: HTMLDivElement
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  fixtures.inputs = []
  fixtures.open.mockClear()
  fixtures.dismissNudge.mockClear()
  fixtures.markSessionViewed.mockClear()
  container = document.createElement("div")
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
})
const render = () => act(() => root.render(<FollowUpList />))
const rows = () => Array.from(container.querySelectorAll<HTMLElement>("[data-follow-up-reason]"))

test("renders nothing when no session needs a follow-up", () => {
  fixtures.inputs = [input("idle")]
  render()
  expect(container.querySelector("[data-follow-up-list]")).toBeNull()
})

test("lists failures before finished work and never lists a session that waits on a decision", () => {
  fixtures.inputs = [
    input("dirty", { finishedWithUncommitted: true }),
    input("blocked", { permissionCount: 1, hasError: true }),
    input("failed", { hasError: true }),
    input("working", { hasError: true, statusType: "busy" }),
  ]
  render()
  expect(rows().map((row) => row.getAttribute("data-follow-up-reason"))).toEqual(["error", "uncommitted"])
  expect(container.textContent).toContain("Session failed")
  expect(container.textContent).toContain("Session dirty")
  expect(container.textContent).not.toContain("Session blocked")
  expect(container.textContent).not.toContain("Session working")
})

test("a dismissal clears both the failure and the finished work, so the row goes away in one click", () => {
  fixtures.inputs = [input("both", { hasError: true, finishedWithUncommitted: true })]
  render()
  act(() => rows()[0]!.querySelector<HTMLButtonElement>("button[aria-label='chat.turnNextSteps.dismiss']")!.click())
  expect(fixtures.markSessionViewed).toHaveBeenCalledWith("both")
  expect(fixtures.dismissNudge).toHaveBeenCalledWith("both")
})

test("opening a row opens that session in its project without dismissing it", () => {
  fixtures.inputs = [input("failed", { hasError: true })]
  render()
  act(() => rows()[0]!.querySelector<HTMLButtonElement>("button")!.click())
  expect(fixtures.open).toHaveBeenCalledWith({ sessionId: "failed", projectId: "app", directory: "/work/app" })
  expect(fixtures.markSessionViewed).not.toHaveBeenCalled()
  expect(fixtures.dismissNudge).not.toHaveBeenCalled()
})

test("collapses past three rows and expands on request", () => {
  fixtures.inputs = ["a", "b", "c", "d", "e"].map((id) => input(id, { hasError: true }))
  render()
  expect(rows()).toHaveLength(3)
  const toggle = container.querySelector<HTMLButtonElement>("button[aria-expanded]")!
  act(() => toggle.click())
  expect(rows()).toHaveLength(5)
})
