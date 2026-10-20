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
import { readPersistedSupervision, useSupervisionStore } from "@/stores/useSupervisionStore"
import { openSupervisedSession } from "@/lib/supervision/openSession"
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
afterEach(cleanup)

const selected = () => screen.getByRole("grid").getAttribute("aria-activedescendant")
const key = (key: string) => fireEvent.keyDown(screen.getByRole("grid"), { key })

describe("Mission Control grouped board", () => {
  test("j follows visible group order and enters the next project instead of the urgency input order", () => {
    render(<MissionControl />)
    expect(screen.getAllByRole("rowgroup").map((group) => group.getAttribute("aria-label"))).toEqual(["Alpha", "Beta"])
    expect(selected()).toBe("mission-row-a1")
    key("j")
    expect(selected()).toBe("mission-row-a2")
    key("Enter")
    expect(openSupervisedSession).toHaveBeenCalledWith({
      sessionId: "a2",
      projectId: "alpha",
      directory: "/home/me/alpha",
    })
    key("j")
    expect(selected()).toBe("mission-row-b1")
    key(" ")
    expect(document.getElementById("mission-details-b1")).not.toBeNull()
    key("ArrowUp")
    expect(selected()).toBe("mission-row-a2")
    key("k")
    expect(selected()).toBe("mission-row-a1")
  })

  test("collapsed rows leave navigation and selection fallback, and all collapsed groups have no active descendant", () => {
    render(<MissionControl />)
    key(" ")
    fireEvent.click(screen.getByRole("button", { name: "Collapse Alpha" }))
    expect(document.getElementById("mission-row-a1")).toBeNull()
    expect(document.getElementById("mission-details-a1")).toBeNull()
    expect(selected()).toBe("mission-row-b1")
    key("k")
    expect(selected()).toBe("mission-row-b1")
    key("j")
    expect(selected()).toBe("mission-row-b1")
    fireEvent.click(screen.getByRole("button", { name: "Collapse Beta" }))
    expect(selected()).toBeNull()
    key("Enter")
    key(" ")
    expect(openSupervisedSession).not.toHaveBeenCalled()
    expect(document.querySelector('[id^="mission-details-"]')).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Expand Alpha" }))
    expect(selected()).toBe("mission-row-a1")
    expect(screen.getByRole("button", { name: "Collapse Alpha" }).getAttribute("aria-expanded")).toBe("true")
  })

  test("filter fallback uses visible group order without overwriting the remembered session", () => {
    useSupervisionStore.setState({ boardFocusSessionId: "b1" })
    render(<MissionControl />)
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Alpha" } })
    expect(selected()).toBe("mission-row-a1")
    expect(useSupervisionStore.getState().boardFocusSessionId).toBe("b1")
  })

  test("ungrouping restores urgency order and project metadata; toggling preserves local collapse state", () => {
    render(<MissionControl />)
    const toggle = screen.getByRole("button", { name: "Group by project" })
    expect(toggle.getAttribute("aria-pressed")).toBe("true")
    expect(within(document.getElementById("mission-row-a2")!).queryByText("Alpha · ~/alpha")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Collapse Alpha" }))
    fireEvent.click(toggle)
    expect(screen.queryAllByRole("rowgroup")).toHaveLength(0)
    expect(Array.from(document.querySelectorAll(".mission-control-row"), (item) => item.id)).toEqual([
      "mission-row-a1",
      "mission-row-b1",
      "mission-row-a2",
    ])
    expect(within(document.getElementById("mission-row-a2")!).getByText("Alpha · ~/alpha").getAttribute("title")).toBe(
      "/home/me/alpha",
    )
    expect(readPersistedSupervision(localStorage).boardGroupBy).toBe("none")
    fireEvent.click(toggle)
    expect(document.getElementById("mission-row-a1")).toBeNull()
    expect(readPersistedSupervision(localStorage).boardGroupBy).toBe("project")
  })

  test("group headers show counts, aggregate evidence and abbreviated paths, without counting as session rows", () => {
    const rows = useSupervisionStore
      .getState()
      .rows.map((item, index) => ({ ...item, evidence: index === 1 ? null : { additions: 3, deletions: 2, files: 1 } }))
    useSupervisionStore.setState({ rows })
    render(<MissionControl />)
    const alpha = within(screen.getByRole("rowgroup", { name: "Alpha" }))
    expect(alpha.getByText("1 need you · 1 running")).toBeTruthy()
    expect(alpha.getByText("~/alpha").getAttribute("title")).toBe("/home/me/alpha")
    // The full summary is screen-reader text; the coloured numbers are decorative.
    expect(alpha.getByText("+6 −4 · 2 files").className).toContain("sr-only")
    expect(alpha.getByText("+6 −4").getAttribute("aria-hidden")).toBe("true")
    expect(document.querySelectorAll(".mission-control-row")).toHaveLength(3)
    const session = within(document.getElementById("mission-row-a1")!)
    expect(document.querySelector("#mission-row-a1 .mission-evidence")?.textContent).toBe("+3 −2 · 1 file")
    expect(session.getByText("feat/grouped-board")).toBeTruthy()
  })

  test("missing evidence, age and branch render no placeholder; details is icon-only and retains action context", () => {
    render(<MissionControl />)
    const beta = within(document.getElementById("mission-row-b1")!)
    expect(beta.queryByText("—")).toBeNull()
    expect(beta.queryByText("feat/grouped-board")).toBeNull()
    const details = beta.getByRole("button", { name: "Details — Beta · Task b1" })
    expect(details.textContent).toBe("")
    expect(details.getAttribute("title")).toBe("Details")
    expect(beta.getByRole("button", { name: "Answer — Beta · Task b1" })).toBeTruthy()
    fireEvent.click(details)
    expect(details.getAttribute("aria-controls")).toBe("mission-details-b1")
    const peek = within(document.getElementById("mission-details-b1")!)
    expect(peek.getByText("~/beta").getAttribute("title")).toBe("/home/me/beta")
    expect(peek.queryByText("—")).toBeNull()
    expect(peek.getByRole("button", { name: "Open session" })).toBeTruthy()
    expect(peek.getByRole("combobox", { name: "Add to working set" })).toBeTruthy()
  })

  test("density buttons persist their state without replacing the selected DOM row; shortcut uses key chips", () => {
    render(<MissionControl />)
    key("j")
    const selectedRow = document.getElementById("mission-row-a2")
    const compact = screen.getByRole("button", { name: "Compact" })
    fireEvent.click(compact)
    expect(compact.getAttribute("aria-pressed")).toBe("true")
    expect(screen.getByRole("button", { name: "Comfortable" }).getAttribute("aria-pressed")).toBe("false")
    expect(readPersistedSupervision(localStorage)).toMatchObject({ density: "compact", boardGroupBy: "project" })
    expect(document.getElementById("mission-row-a2")).toBe(selectedRow)
    expect(selected()).toBe("mission-row-a2")
    expect(screen.queryByRole("combobox")).toBeNull()
    expect(document.querySelectorAll("kbd").length).toBeGreaterThan(1)
    expect(screen.getByRole("button", { name: "Quick dispatch" }).classList.contains("normal-case")).toBe(true)
  })

  test("missing project metadata has a localized group and legacy or invalid preferences default to project", () => {
    act(() =>
      useSupervisionStore.setState({
        rows: [{ ...row("none", "alpha", "running"), projectId: null, projectLabel: null, directory: null }],
      }),
    )
    render(<MissionControl />)
    expect(screen.getByRole("rowgroup", { name: "No project" })).toBeTruthy()
    for (const value of [null, "{}", '{"boardGroupBy":"invalid"}']) {
      expect(readPersistedSupervision({ getItem: () => value } as unknown as Storage).boardGroupBy).toBe("project")
    }
    expect(
      readPersistedSupervision({ getItem: () => '{"boardGroupBy":"none"}' } as unknown as Storage).boardGroupBy,
    ).toBe("none")
  })
})
