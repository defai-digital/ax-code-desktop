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

const seedPrRows = () => {
  const states = ["open", "draft", "merged", "closed"] as const
  useSupervisionStore.setState({
    rows: states.flatMap((state, index) =>
      ["alpha", "beta"].map((project) => ({
        ...row(`${project}-${state}`, project, index === 0 ? "permission" : "running"),
        updatedAt: 10,
        evidence: project === "alpha" ? { files: 1, additions: 1, deletions: 0 } : null,
        pullRequest: {
          number: index + 1,
          state,
          checks: state === "draft" ? ("pending" as const) : ("failed" as const),
        },
      })),
    ),
    lastViewedAt: {},
  })
}
const openPr = async () => {
  await act(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  })
  fireEvent.click(screen.getByRole("button", { name: "PR" }))
  await settle()
}

test("PR/CI menu ORs selections, ANDs groups, excludes completed failures and exposes removable chips", async () => {
  seedPrRows()
  render(<MissionControl />)
  await openPr()
  expect(screen.getByRole("menuitemcheckbox", { name: "Checks failing (2)" })).toBeTruthy()
  expect(screen.getByRole("menuitemcheckbox", { name: "No checks (0)" })).toBeTruthy()
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Open PR (2)" }))
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Draft PR (2)" }))
  expect(visibleIds()).toHaveLength(4)
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Checks failing (2)" }))
  expect(visibleIds()).toEqual(["mission-row-alpha-open", "mission-row-beta-open"])
  expect(screen.getByRole("menuitemcheckbox", { name: "Merged PR (0)" })).toBeTruthy()
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Checks pending (2)" }))
  expect(visibleIds()).toHaveLength(4)
  await closeProjects()
  fireEvent.click(screen.getByRole("button", { name: "Remove filter Open PR" }))
  expect(visibleIds()).toEqual(["mission-row-alpha-draft", "mission-row-beta-draft"])
  fireEvent.click(screen.getByRole("button", { name: "Clear all" }))
  expect(visibleIds()).toHaveLength(8)
})

test("PR counts follow project, status, search, changes, updated and working-set filters", async () => {
  seedPrRows()
  render(<MissionControl />)
  await openProjects()
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Alpha (4)" }))
  await closeProjects()
  fireEvent.click(screen.getByRole("button", { name: "Running (3)" }))
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "draft" } })
  fireEvent.click(screen.getByRole("button", { name: "Has changes" }))
  await openPr()
  expect(screen.getByRole("menuitemcheckbox", { name: "Draft PR (1)" })).toBeTruthy()
  expect(screen.getByRole("menuitemcheckbox", { name: "Open PR (0)" })).toBeTruthy()
  expect(screen.getByRole("menuitemcheckbox", { name: "Checks pending (1)" })).toBeTruthy()
  await closeProjects()
  act(() => useSupervisionStore.setState({ lastViewedAt: { "alpha-draft": 11 } }))
  fireEvent.click(screen.getByRole("button", { name: "Updated since my last visit (7)" }))
  await openPr()
  expect(screen.getByRole("menuitemcheckbox", { name: "Draft PR (0)" })).toBeTruthy()
  await closeProjects()
  fireEvent.click(screen.getByRole("button", { name: "Clear all" }))
  act(() =>
    useSupervisionStore.setState({
      workingSets: [{ id: "one", name: "One", sessionIds: ["beta-closed"] }],
      activeWorkingSetId: "one",
    }),
  )
  await openPr()
  expect(screen.getAllByRole("menuitemcheckbox").map((e) => e.getAttribute("aria-label"))).toContain("Closed PR (1)")
  expect(screen.getByRole("menuitemcheckbox", { name: "Open PR (0)" })).toBeTruthy()
})

test("PR keyboard selection stays open and Escape returns to the trigger without closing the board", async () => {
  seedPrRows()
  render(<MissionControl />)
  const trigger = screen.getByRole("button", { name: "PR" })
  act(() => trigger.focus())
  fireEvent.keyDown(trigger, { key: "ArrowDown" })
  await settle()
  const option = screen.getByRole("menuitemcheckbox", { name: "Draft PR (2)" })
  act(() => option.focus())
  fireEvent.keyDown(option, { key: "Enter" })
  await settle()
  expect(option.getAttribute("aria-checked")).toBe("true")
  expect(visibleIds()).toHaveLength(2)
  await closeProjects()
  expect(trigger.getAttribute("aria-expanded")).toBe("false")
  expect(useSupervisionStore.getState().missionControlOpen).toBe(true)
})

for (const facet of ["search", "status", "changes", "project", "updated"] as const) {
  test(`PR counts independently honor the ${facet} facet`, async () => {
    seedPrRows()
    render(<MissionControl />)
    if (facet === "search") fireEvent.change(screen.getByRole("searchbox"), { target: { value: "beta-open" } })
    if (facet === "status") fireEvent.click(screen.getByRole("button", { name: "Running (6)" }))
    if (facet === "changes") fireEvent.click(screen.getByRole("button", { name: "Has changes" }))
    if (facet === "project") {
      await openProjects()
      fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Beta (4)" }))
      await closeProjects()
    }
    if (facet === "updated") {
      act(() => useSupervisionStore.setState({ lastViewedAt: { "alpha-open": 11 } }))
      fireEvent.click(screen.getByRole("button", { name: "Updated since my last visit (7)" }))
    }
    await openPr()
    expect(screen.getByRole("menuitemcheckbox", { name: `Open PR (${facet === "status" ? 0 : 1})` })).toBeTruthy()
  })
}

test("passing and no-check PRs can be selected while absent and stale data stay unknown", async () => {
  seedPrRows()
  act(() => useSupervisionStore.setState({ rows: [
    { ...row("passed", "alpha", "running"), pullRequest: { number: 11, state: "open", checks: "passed" } },
    { ...row("none", "alpha", "running"), pullRequest: { number: 12, state: "draft" } },
    { ...row("stale", "alpha", "running"), pullRequest: { number: 13, state: "open", checks: "passed", stale: true } },
    row("absent", "alpha", "running"),
  ] }))
  render(<MissionControl />)
  await openPr()
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Checks passing (1)" }))
  expect(visibleIds()).toEqual(["mission-row-passed"])
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "No checks (1)" }))
  expect(visibleIds()).toEqual(["mission-row-passed", "mission-row-none"])
})
