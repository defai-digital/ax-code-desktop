import React, { act } from "react"
import { cleanup, fireEvent, render, screen, within } from "@/test/dom"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { SupervisionRow } from "@/lib/supervision/rows"

vi.mock("@/lib/i18n", async () => {
  const { dict } = await import("@/lib/i18n/messages/en")
  return {
    useI18n: () => ({
      t: (key: keyof typeof dict, params: Record<string, string | number> = {}) =>
        (dict[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? name)),
      number: (value: number) => String(value),
    }),
  }
})
vi.mock("@/hooks/useSupervisionRows", () => ({ useSupervisionRows: () => useSupervisionStore((s) => s.rows) }))
vi.mock("@/stores/useGitStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/stores/useGitStore")>()),
  useGitBranchLabel: (directory: string | null) => (directory === "/home/me/alpha" ? "feat/grouped-board" : null),
}))
vi.mock("@/sync/sync-context", () => ({ useAllPendingRequests: () => [] }))
vi.mock("@/sync/session-actions", () => ({
  respondToPermission: vi.fn(),
  respondToQuestion: vi.fn(),
  rejectQuestion: vi.fn(),
}))
vi.mock("@/lib/supervision/openSession", () => ({ openSupervisedSession: vi.fn() }))
vi.mock("@/lib/supervision/openBesideChat", () => ({ openBesideChat: vi.fn() }))
vi.mock("@/components/ui", () => ({ toast: { error: vi.fn() } }))

import { useDirectoryStore } from "@/stores/useDirectoryStore"
import { useSupervisionStore } from "@/stores/useSupervisionStore"
import { MissionControl } from "./MissionControl"

const row = (sessionId: string, projectId: string, state: SupervisionRow["state"]): SupervisionRow => ({
  sessionId,
  title: `Task ${sessionId}`,
  state,
  treeSessionIds: [sessionId],
  projectId,
  projectLabel: projectId === "alpha" ? "Alpha" : "Beta",
  directory: `/home/me/${projectId}`,
  updatedAt: 0,
  evidence: null,
  goal: null,
})

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks()
  useDirectoryStore.setState({ homeDirectory: "/home/me" })
  Element.prototype.scrollIntoView = vi.fn()
  useSupervisionStore.setState({
    rows: [row("a1", "alpha", "permission"), row("b1", "beta", "question"), row("a2", "alpha", "running")],
    density: "comfortable",
    boardGroupBy: "project",
    boardFocusSessionId: null,
    workingSets: [],
    activeWorkingSetId: null,
    missionControlOpen: true,
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const visibleIds = () => Array.from(document.querySelectorAll(".mission-control-row"), (row) => row.id)
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
const openProjects = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Projects" }))
  await settle()
}
const closeProjects = async () => {
  fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" })
  await settle()
}

describe("Mission Control compound filters", () => {
  test("offers scoped project counts, ORs projects and removes individual project and status chips", async () => {
    render(<MissionControl />)
    await openProjects()
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Alpha (2)" }))
    expect(visibleIds()).toEqual(["mission-row-a1", "mission-row-a2"])
    expect(screen.getByRole("menuitemcheckbox", { name: "Alpha (2)" }).getAttribute("aria-checked")).toBe("true")
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Beta (1)" }))
    expect(visibleIds()).toHaveLength(3)
    await closeProjects()
    fireEvent.click(screen.getByRole("button", { name: "Remove filter Alpha" }))
    expect(visibleIds()).toEqual(["mission-row-b1"])
    fireEvent.click(screen.getByRole("button", { name: "Needs attention (1)" }))
    fireEvent.click(screen.getByRole("button", { name: "Remove filter Needs attention" }))
    expect(screen.getByRole("button", { name: "All (1)" }).getAttribute("aria-pressed")).toBe("true")
    fireEvent.click(screen.getByRole("button", { name: "Remove filter Beta" }))
    expect(visibleIds()).toHaveLength(3)
    expect(screen.queryByRole("button", { name: "Clear all" })).toBeNull()
  })

  test("checks failing keeps the session whose envelopes failed and clears with the other facets", async () => {
    useSupervisionStore.setState({
      rows: useSupervisionStore.getState().rows.map((item) => ({
        ...item,
        checks:
          item.sessionId === "b1"
            ? { state: "failed" as const, passed: 1, failed: 1, total: 2 }
            : { state: "passed" as const, passed: 1, failed: 0, total: 1 },
      })),
    })
    render(<MissionControl />)
    fireEvent.click(screen.getByRole("button", { name: "Checks failing" }))
    expect(screen.getByRole("button", { name: "Checks failing" }).getAttribute("aria-pressed")).toBe("true")
    expect(visibleIds()).toEqual(["mission-row-b1"])
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }))
    expect(visibleIds()).toHaveLength(3)
    expect(screen.getByRole("button", { name: "Checks failing" }).getAttribute("aria-pressed")).toBe("false")
  })

  test("combines every facet and Clear all restores rows, search and toggle state", async () => {
    useSupervisionStore.setState({
      rows: useSupervisionStore.getState().rows.map((item) => ({
        ...item,
        evidence: item.sessionId === "a2" ? { files: 1, additions: 2, deletions: 0 } : null,
      })),
    })
    render(<MissionControl />)
    await openProjects()
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Alpha (2)" }))
    await closeProjects()
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Task" } })
    fireEvent.click(screen.getByRole("button", { name: "Running (1)" }))
    fireEvent.click(screen.getByRole("button", { name: "Has changes" }))
    expect(visibleIds()).toEqual(["mission-row-a2"])
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }))
    expect(visibleIds()).toHaveLength(3)
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("")
    expect(screen.getByRole("button", { name: "Has changes" }).getAttribute("aria-pressed")).toBe("false")
    expect(screen.getByRole("button", { name: "All (3)" }).getAttribute("aria-pressed")).toBe("true")
    expect(screen.queryByRole("button", { name: "Remove filter Alpha" })).toBeNull()
  })

  test("project filtering preserves hidden needs-you recovery and permanently prunes bulk selection", async () => {
    render(<MissionControl />)
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Beta · Task b1" }))
    await openProjects()
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Alpha (2)" }))
    await closeProjects()
    expect(screen.queryByRole("toolbar")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "1 need you outside this view" }))
    expect(visibleIds()).toHaveLength(3)
    expect(screen.queryByRole("button", { name: "Clear all" })).toBeNull()
    expect((screen.getByRole("checkbox", { name: "Select Beta · Task b1" }) as HTMLInputElement).checked).toBe(false)
  })

  test("project options come from the scope while counts follow the other active filters", async () => {
    useSupervisionStore.setState({
      workingSets: [{ id: "set", name: "Focus", sessionIds: ["a1", "a2"] }],
      activeWorkingSetId: "set",
    })
    render(<MissionControl />)
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "absent" } })
    await openProjects()
    expect(screen.getAllByRole("menuitemcheckbox")).toHaveLength(1)
    expect(screen.getByRole("menuitemcheckbox", { name: "Alpha (0)" })).toBeTruthy()
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Alpha (0)" }))
    await closeProjects()
    fireEvent.click(screen.getByRole("button", { name: "2 need you outside this view" }))
    expect(useSupervisionStore.getState().activeWorkingSetId).toBeNull()
    expect(visibleIds()).toHaveLength(3)
  })

  test("keyboard opens and toggles projects, and Escape closes the menu without clearing selection or closing the board", async () => {
    render(<MissionControl />)
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Alpha · Task a1" }))
    const trigger = screen.getByRole("button", { name: "Projects" })
    act(() => trigger.focus())
    fireEvent.keyDown(trigger, { key: "ArrowDown" })
    await settle()
    const alpha = screen.getByRole("menuitemcheckbox", { name: "Alpha (2)" })
    act(() => alpha.focus())
    fireEvent.keyDown(alpha, { key: "Enter" })
    await settle()
    expect(alpha.getAttribute("aria-checked")).toBe("true")
    expect(screen.getByRole("button", { name: "Remove filter Alpha" })).toBeTruthy()
    await closeProjects()
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
    expect(useSupervisionStore.getState().missionControlOpen).toBe(true)
    expect((screen.getByRole("checkbox", { name: "Select Alpha · Task a1" }) as HTMLInputElement).checked).toBe(true)
  })
})

describe("Mission Control child visibility", () => {
  test("shows the child count and own states and ages in Details without adding session rows or renaming actions", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000)
    const root = {
      ...row("a1", "alpha", "permission"),
      treeSessionIds: ["a1", "codex", "claude"],
      childSessions: [
        { sessionId: "codex", title: "Codex tests", state: "running" as const, updatedAt: Date.now() - 120_000 },
        { sessionId: "claude", title: "claude", state: "idle" as const, updatedAt: Date.now() - 3600_000 },
      ],
    }
    useSupervisionStore.setState({ rows: [root] })
    render(<MissionControl />)
    expect(screen.getByText("+2 agents")).toBeTruthy()
    expect(screen.queryByRole("list", { name: "Child agents" })).toBeNull()
    expect(screen.getByRole("checkbox", { name: "Select Alpha · Task a1" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Details — Alpha · Task a1" }))
    const children = within(screen.getByRole("list", { name: "Child agents" })).getAllByRole("listitem")
    expect(children).toHaveLength(2)
    expect(within(children[0]).getByText("Codex tests")).toBeTruthy()
    expect(children[0].querySelector("[data-supervision-state]")?.getAttribute("data-supervision-state")).toBe(
      "running",
    )
    expect(within(children[0]).getByText("2m ago")).toBeTruthy()
    expect(within(children[1]).getByText("claude")).toBeTruthy()
    expect(children[1].querySelector("[data-supervision-state]")?.getAttribute("data-supervision-state")).toBe("idle")
    expect(within(children[1]).getByText("1h ago")).toBeTruthy()
    expect(visibleIds()).toEqual(["mission-row-a1"])
    fireEvent.click(screen.getByRole("button", { name: "Details — Alpha · Task a1" }))
    expect(screen.queryByRole("list", { name: "Child agents" })).toBeNull()
  })

  test("root-only sessions have no child chip or list and retain the Open name", () => {
    useSupervisionStore.setState({ rows: [row("a2", "alpha", "running")] })
    render(<MissionControl />)
    expect(document.querySelector(".mission-child-count")).toBeNull()
    expect(screen.getByRole("button", { name: "Open — Alpha · Task a2" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Details — Alpha · Task a2" }))
    expect(screen.queryByRole("list", { name: "Child agents" })).toBeNull()
  })
})

test("PR menu filters structured PRs, exposes a removable chip and resets through Clear all", async () => {
  useSupervisionStore.setState({
    rows: useSupervisionStore.getState().rows.map((item) => ({
      ...item,
      pullRequest:
        item.sessionId === "a1"
          ? { number: 42, state: "open" as const, checks: "failed" as const }
          : item.sessionId === "b1"
            ? { number: 43, state: "draft" as const, checks: "pending" as const }
            : // A merged PR whose checks failed is not actionable and must not match the failing facet.
              { number: 44, state: "merged" as const, checks: "failed" as const },
    })),
  })
  render(<MissionControl />)
  fireEvent.click(screen.getByRole("button", { name: "PR" }))
  await settle()
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Has an open PR" }))
  await settle()
  expect(visibleIds()).toEqual(["mission-row-a1", "mission-row-b1"])
  fireEvent.click(screen.getByRole("button", { name: "Remove filter Has an open PR" }))
  await act(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  })
  expect(visibleIds()).toHaveLength(3)
  fireEvent.click(screen.getByRole("button", { name: "PR" }))
  await settle()
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Checks failing on PR" }))
  await settle()
  expect(visibleIds()).toEqual(["mission-row-a1"])
  fireEvent.click(screen.getByRole("button", { name: "Clear all" }))
  await settle()
  expect(visibleIds()).toHaveLength(3)
  expect(screen.queryByRole("button", { name: "Remove filter Checks failing on PR" })).toBeNull()
})
