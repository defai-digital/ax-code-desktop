import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { cleanup, render as renderDom } from "@/test/dom"
import type { HookCompleted } from "@defai-digital/ax-code-sdk/v2/client"
import type { SupervisionRow } from "@/lib/supervision/rows"
import { useHookActivityStore } from "@/stores/useHookActivityStore"

vi.doMock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      params ? `${key}:${Object.values(params).join("|")}` : key,
    relativeTime: (value: number, unit: string) => `${value} ${unit}`,
    number: (value: number) => String(value),
  }),
}))

const { MissionControlPeek } = await import("./MissionControlPeek")

const row: SupervisionRow = {
  sessionId: "ses_1",
  title: "Session",
  state: "idle",
  treeSessionIds: ["ses_1"],
  projectId: null,
  projectLabel: null,
  directory: "/repo",
  updatedAt: 1,
  evidence: null,
  goal: null,
}

const completed = (overrides: Partial<HookCompleted> = {}): HookCompleted => ({
  sessionID: "ses_1",
  event: "PreToolUse",
  tool: "bash",
  command: "guard.sh",
  source: "project",
  exit: 0,
  durationMs: 5,
  outcome: "ok",
  ...overrides,
})

const noop = () => undefined

describe("MissionControlPeek hook runs", () => {
  let container: HTMLDivElement
  let root: Root

  const render = (rowOverrides: Partial<SupervisionRow> = {}) => {
    act(() =>
      root.render(
        <MissionControlPeek
          row={{ ...row, ...rowOverrides }}
          requests={[]}
          workingSets={[]}
          isCreatingSetForRow={false}
          newSetName=""
          onNewSetNameChange={noop}
          onOpen={noop}
          onReviewChanges={noop}
          onAddToWorkingSet={noop}
          onStartCreateSet={noop}
          onSubmitCreateSet={noop}
          onCancelCreateSet={noop}
        />,
      ),
    )
  }

  const hookRunLines = () => Array.from(container.querySelectorAll<HTMLElement>("[data-hook-run]"))

  beforeEach(() => {
    useHookActivityStore.setState({ runsBySession: {}, countersByDirectory: {} })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test("lists the session's last five hook runs with their outcomes, newest first", () => {
    const { ingestHookCompleted } = useHookActivityStore.getState()
    const outcomes: HookCompleted["outcome"][] = ["ok", "failed", "blocked", "ask", "ok", "blocked", "failed"]
    outcomes.forEach((outcome, index) => {
      ingestHookCompleted(completed({ outcome, tool: `tool-${index}` }), "/repo", index)
    })
    render()

    const lines = hookRunLines()
    expect(lines).toHaveLength(5)
    expect(lines[0].textContent).toContain("supervision.hookOutcome.failed")
    expect(lines[0].textContent).toContain("tool-6")
    expect(lines[4].textContent).toContain("supervision.hookOutcome.blocked")
    expect(lines[4].textContent).toContain("tool-2")
    expect(container.textContent).toContain("supervision.missionControl.peek.hookRunsTitle")
  })

  test("shows no hook section when the session has no runs", () => {
    render()
    expect(hookRunLines()).toHaveLength(0)
    expect(container.textContent).not.toContain("hookRunsTitle")
  })

  test("shows the goal reason label and the goal line for a blocked goal", () => {
    render({
      state: "goal",
      goal: {
        sessionId: "ses_1",
        objective: "Ship the migration",
        status: "budget_limited",
        tokensUsed: 5000,
        timeUsedSeconds: 90,
        remainingTimeSeconds: 600,
        createdAt: 1000,
      },
    })
    expect(container.textContent).toContain("supervision.state.goal")
    const line = container.querySelector("[data-goal-line]")
    expect(line?.textContent).toContain("supervision.goal.status.budget_limited")
    expect(line?.textContent).toContain("Ship the migration")
    expect(line?.textContent).toContain("supervision.goal.remainingTimeMinutes:10")
    expect(line?.querySelector("[title]")?.getAttribute("title")).toBe("Ship the migration")
  })

  test("shows a paused goal line without the goal reason label", () => {
    render({
      state: "idle",
      goal: {
        sessionId: "ses_1",
        objective: "Ship the migration",
        status: "paused",
        tokensUsed: 0,
        timeUsedSeconds: 0,
        createdAt: 1000,
      },
    })
    expect(container.querySelector("[data-goal-line]")?.textContent).toContain("supervision.goal.status.paused")
    expect(container.textContent).not.toContain("supervision.state.goal")
  })

  test("shows no goal line when there is no goal", () => {
    render()
    expect(container.querySelector("[data-goal-line]")).toBeNull()
  })
})

describe("Mission Control peek verification detail", () => {
  afterEach(() => cleanup())

  test("lists the envelope counts and the verbatim remaining budget", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_060_000)
    const { container } = renderDom(
      <MissionControlPeek
        row={{
          ...row,
          checks: { state: "failed", passed: 1, failed: 2, total: 3, updatedAt: 1_700_000_000_000 },
          goal: {
            sessionId: "ses_1",
            objective: "Ship the migration",
            status: "active",
            tokensUsed: 4,
            timeUsedSeconds: 5,
            remainingTokens: 12,
            createdAt: 1000,
          },
        }}
        requests={[]}
        workingSets={[]}
        isCreatingSetForRow={false}
        newSetName=""
        onNewSetNameChange={noop}
        onOpen={noop}
        onAddToWorkingSet={noop}
        onStartCreateSet={noop}
        onSubmitCreateSet={noop}
        onCancelCreateSet={noop}
      />,
    )
    const detail = container.querySelector("[data-checks-detail]")
    expect(detail?.getAttribute("aria-label")).toBe("supervision.missionControl.peek.checksTitle")
    expect(detail?.querySelector("[data-checks-state]")?.getAttribute("data-checks-state")).toBe("failed")
    expect(detail?.querySelector("[data-checks-failed]")?.textContent).toBe("2")
    expect(detail?.textContent).toContain("supervision.missionControl.peek.checksPassed")
    expect(detail?.textContent).toContain("supervision.missionControl.peek.checksTotal")
    expect(container.querySelector("[data-goal-budget-tokens]")?.textContent).toContain("12")
    expect(container.querySelector("[data-goal-budget-time]")).toBeNull()
    vi.restoreAllMocks()
  })
})
