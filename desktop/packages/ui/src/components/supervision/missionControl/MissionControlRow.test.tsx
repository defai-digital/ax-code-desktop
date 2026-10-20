import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { SupervisionRow } from "@/lib/supervision/rows"
import type { SupervisionState } from "@/lib/supervision/sessionState"
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      params ? `${key}:${Object.values(params).join("|")}` : key,
    number: (value: number) => String(value),
  }),
}))
import { MissionControlRow } from "./MissionControlRow"

const row: SupervisionRow = {
  sessionId: "s1",
  title: "Fix a long task",
  state: "review",
  treeSessionIds: ["s1"],
  projectId: "p1",
  projectLabel: "Long project name",
  directory: "/repo",
  updatedAt: Date.now(),
  evidence: { files: 3, additions: 20, deletions: 1 },
  goal: null,
}
describe("Mission Control row interaction", () => {
  let container: HTMLDivElement
  let root: Root
  const onSelect = vi.fn(),
    onOpen = vi.fn(),
    onPrimary = vi.fn(),
    onRemove = vi.fn(),
    onToggleDetails = vi.fn()
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.clearAllMocks()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })
  const render = (state: SupervisionState = "review", overrides: Partial<SupervisionRow> = {}) =>
    act(() =>
      root.render(
        <div role="grid" tabIndex={0}>
          <MissionControlRow
            row={{ ...row, state, ...overrides }}
            selected
            expanded={false}
            activeWorkingSetId="w1"
            primaryLabel="Review changes"
            onToggleDetails={onToggleDetails}
            onSelect={onSelect}
            onOpen={onOpen}
            onPrimary={onPrimary}
            onCompare={vi.fn()}
            onRemoveFromSet={onRemove}
          />
        </div>,
      ),
    )
  test("primary and remove actions do not select the row; row selection returns focus to the grid", () => {
    render()
    const buttons = container.querySelectorAll("button")
    act(() => buttons[0].click())
    expect(onPrimary).toHaveBeenCalledWith(row)
    expect(onSelect).not.toHaveBeenCalled()
    act(() => buttons[2].click())
    expect(onRemove).toHaveBeenCalledWith("w1", "s1")
    expect(onSelect).not.toHaveBeenCalled()
    act(() => container.querySelector<HTMLElement>('[role="row"]')!.click())
    expect(onSelect).toHaveBeenCalledWith("s1")
    expect(document.activeElement).toBe(container.querySelector('[role="grid"]'))
    expect(container.querySelectorAll('[role="gridcell"]')).toHaveLength(4)
    expect(container.textContent).toContain(row.projectLabel)
  })
  test("details is a separate discoverable action with project context", () => {
    render()
    const details = container.querySelector<HTMLButtonElement>('button[aria-expanded="false"]')!
    expect(details.getAttribute("aria-label")).toContain("Long project name")
    act(() => details.click())
    expect(onToggleDetails).toHaveBeenCalledWith("s1")
    expect(onSelect).not.toHaveBeenCalled()
    expect(onOpen).not.toHaveBeenCalled()
    for (const button of container.querySelectorAll("button")) {
      expect(button.getAttribute("aria-label")).toContain("Long project name")
    }
  })
  test("double-clicking row actions does not open the session", () => {
    render()
    for (const button of Array.from(container.querySelectorAll("button"))) {
      act(() => button.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })))
    }
    expect(onOpen).not.toHaveBeenCalled()
  })
  test.each(["permission", "question", "error", "review", "running", "idle"] as const)(
    "%s keeps a textual status and stable row identity",
    (state) => {
      render(state)
      expect(container.querySelector('[role="row"]')?.id).toBe("mission-row-s1")
      expect(container.querySelector("[data-supervision-state]")?.textContent).toContain(`supervision.state.${state}`)
    },
  )
  test("goal state keeps a textual status and stable row identity", () => {
    render("goal")
    expect(container.querySelector("[data-supervision-state]")?.textContent).toContain("supervision.state.goal")
    expect(container.querySelector("[data-supervision-state]")?.getAttribute("aria-label")).toBe(
      "supervision.state.goal",
    )
  })
  test("shows the goal line under the title with status, objective, used and remaining tokens", () => {
    render("goal", {
      goal: {
        sessionId: "s1",
        objective: "Ship the migration",
        status: "blocked",
        tokensUsed: 1200,
        timeUsedSeconds: 90,
        remainingTokens: 3800,
        createdAt: 1000,
      },
    })
    const line = container.querySelector("[data-goal-line]")
    expect(line?.textContent).toContain("supervision.goal.status.blocked")
    expect(line?.textContent).toContain("Ship the migration")
    expect(line?.textContent).toContain("supervision.goal.usedTokens:1200|5000")
    expect(line?.textContent).toContain("supervision.goal.remainingTokens:3800")
    expect(line?.querySelector("[title]")?.getAttribute("title")).toBe("Ship the migration")
  })
  test("shows a paused goal without changing the state badge", () => {
    render("idle", {
      goal: {
        sessionId: "s1",
        objective: "Ship the migration",
        status: "paused",
        tokensUsed: 0,
        timeUsedSeconds: 0,
        createdAt: 1000,
      },
    })
    expect(container.querySelector("[data-supervision-state]")?.textContent).toContain("supervision.state.idle")
    expect(container.querySelector("[data-goal-line]")?.textContent).toContain("supervision.goal.status.paused")
  })
  test("shows no goal line when there is no goal", () => {
    render()
    expect(container.querySelector("[data-goal-line]")).toBeNull()
  })
  test.each([
    ["permission", "border-l-[var(--status-warning)]"],
    ["question", "border-l-[var(--status-warning)]"],
    ["goal", "border-l-[var(--status-warning)]"],
    ["review", "border-l-[var(--status-warning)]"],
    ["error", "border-l-[var(--status-error)]"],
    ["running", "border-l-transparent"],
    ["idle", "border-l-transparent"],
  ] as const)("%s uses the attention border", (state, border) => {
    render(state)
    expect(container.querySelector(".mission-control-row")?.classList.contains(border)).toBe(true)
  })
  test("missing evidence and age do not render placeholder cells", () => {
    render("running", { evidence: null, updatedAt: 0 })
    expect(container.querySelector(".mission-evidence")).toBeNull()
    expect(container.querySelector(".mission-age")).toBeNull()
    expect(container.textContent).not.toContain("—")
  })
})
