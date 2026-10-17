import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { HookCompleted } from "@defai-digital/ax-code-sdk/v2/client"
import type { SupervisionRow } from "@/lib/supervision/rows"
import { useHookActivityStore } from "@/stores/useHookActivityStore"

vi.doMock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      params ? `${key}:${Object.values(params).join("|")}` : key,
    relativeTime: (value: number, unit: string) => `${value} ${unit}`,
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

  const render = () => {
    act(() =>
      root.render(
        <MissionControlPeek
          row={row}
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
})
