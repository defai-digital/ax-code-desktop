import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { HookCompleted } from "@defai-digital/ax-code-sdk/v2/client"
import type { SupervisionRow } from "@/lib/supervision/rows"
import { selectDirectoryHookCounters, useHookActivityStore } from "@/stores/useHookActivityStore"
import { useSupervisionStore } from "@/stores/useSupervisionStore"

vi.doMock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      params ? `${key}:${Object.values(params).join("|")}` : key,
    relativeTime: (value: number, unit: string) => `${value} ${unit}`,
  }),
}))

const { SinceYouLeftStrip } = await import("./SinceYouLeftStrip")

const LEFT_AT = 1_000_000

const row: SupervisionRow = {
  sessionId: "ses_1",
  title: "Session",
  state: "review",
  treeSessionIds: ["ses_1"],
  projectId: null,
  projectLabel: null,
  directory: "/repo",
  updatedAt: LEFT_AT + 60_000,
  evidence: null,
  goal: null,
}

const blockedRun: HookCompleted = {
  sessionID: "ses_1",
  event: "PreToolUse",
  tool: "bash",
  command: "guard.sh",
  source: "project",
  exit: 2,
  durationMs: 5,
  outcome: "blocked",
}

describe("SinceYouLeftStrip hook blocks chip", () => {
  let container: HTMLDivElement
  let root: Root

  const render = () => {
    act(() => root.render(<SinceYouLeftStrip sessionId="ses_1" />))
  }

  const chip = () => container.querySelector("[data-hook-blocks-chip]")

  beforeEach(() => {
    useHookActivityStore.setState({ runsBySession: {}, countersByDirectory: {} })
    useSupervisionStore.setState({ rows: [row], lastViewedAt: { ses_1: LEFT_AT } })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    useSupervisionStore.setState({ rows: [], lastViewedAt: {} })
  })

  test("shows the per-directory blocked count as a chip", () => {
    const { ingestHookCompleted } = useHookActivityStore.getState()
    ingestHookCompleted(blockedRun, "/repo")
    ingestHookCompleted(blockedRun, "/repo")
    ingestHookCompleted({ ...blockedRun, outcome: "failed" }, "/repo")
    ingestHookCompleted(blockedRun, "/other")
    render()

    expect(chip()?.textContent).toBe("supervision.sinceYouLeft.hookBlocks:2")
  })

  test("shows for a goal-only change after the last visit", () => {
    useSupervisionStore.setState({
      rows: [
        {
          ...row,
          state: "goal",
          updatedAt: 1000,
          goal: {
            sessionId: "ses_1",
            objective: "Ship the migration",
            status: "blocked",
            tokensUsed: 10,
            timeUsedSeconds: 5,
            createdAt: 500,
            updatedAt: 20000,
          },
        },
      ],
      lastViewedAt: { ses_1: 10000 },
    })
    render()
    expect(container.querySelector("[data-since-you-left]")).not.toBeNull()
    expect(container.textContent).toContain("supervision.sinceYouLeft.state.goal")
  })

  test("hides the chip when nothing was blocked", () => {
    useHookActivityStore.getState().ingestHookCompleted({ ...blockedRun, outcome: "failed" }, "/repo")
    render()

    expect(container.querySelector("[data-since-you-left]")).not.toBeNull()
    expect(chip()).toBeNull()
  })

  test("dismissing the strip clears the directory counters", () => {
    const { ingestHookCompleted } = useHookActivityStore.getState()
    ingestHookCompleted(blockedRun, "/repo")
    ingestHookCompleted({ ...blockedRun, outcome: "failed" }, "/repo")
    render()
    expect(selectDirectoryHookCounters(useHookActivityStore.getState(), "/repo")).toEqual({ blocked: 1, failed: 1 })

    const dismissButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="supervision.sinceYouLeft.dismiss"]',
    )!
    act(() => dismissButton.click())

    expect(container.querySelector("[data-since-you-left]")).toBeNull()
    expect(selectDirectoryHookCounters(useHookActivityStore.getState(), "/repo")).toEqual({ blocked: 0, failed: 0 })
  })
})
