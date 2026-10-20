import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const popoverMocks = vi.hoisted(() => ({ rows: [] as unknown[] }))

vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      params ? `${key}:${Object.values(params).join("|")}` : key,
    number: (value: number) => String(value),
  }),
}))
vi.mock("@/hooks/useSupervisionRows", () => ({ useSupervisionRows: () => popoverMocks.rows }))
vi.mock("@/sync/sync-context", () => ({ useAllPendingRequests: () => [] }))

import { useSupervisionStore } from "@/stores/useSupervisionStore"
import { NeedsYouPopover } from "./NeedsYouPopover"

describe("NeedsYouPopover", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    popoverMocks.rows = []
    useSupervisionStore.setState({
      missionControlOpen: false,
      needsYouPopoverOpen: true,
      compareRunGroupKey: "run-group",
      recentSessionIds: [],
    })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test("opening Mission Control closes an open compare view", () => {
    const onClose = vi.fn()
    act(() => root.render(<NeedsYouPopover onClose={onClose} />))
    const button = Array.from(container.querySelectorAll("button")).find((item) =>
      item.textContent?.includes("supervision.needsYou.openMissionControl"),
    )
    if (!button) throw new Error("Open Mission Control button not rendered")

    act(() => button.click())

    const supervision = useSupervisionStore.getState()
    expect(supervision.missionControlOpen).toBe(true)
    expect(supervision.needsYouPopoverOpen).toBe(false)
    expect(supervision.compareRunGroupKey).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
  })

  test("shows a goal entry with its reason label and objective line", () => {
    popoverMocks.rows = [
      {
        sessionId: "s-goal",
        title: "Blocked session",
        state: "goal",
        treeSessionIds: ["s-goal"],
        projectId: "p1",
        projectLabel: "Project",
        directory: "/repo",
        updatedAt: 1,
        evidence: null,
        goal: {
          sessionId: "s-goal",
          objective: "Ship the migration",
          status: "blocked",
          tokensUsed: 1200,
          timeUsedSeconds: 90,
          remainingTokens: 3800,
          createdAt: 1000,
        },
      },
    ]
    act(() => root.render(<NeedsYouPopover onClose={vi.fn()} />))
    expect(container.textContent).toContain("supervision.state.goal")
    expect(container.textContent).toContain("Blocked session")
    const line = container.querySelector("[data-goal-line]")
    expect(line?.textContent).toContain("supervision.goal.status.blocked")
    expect(line?.textContent).toContain("Ship the migration")
    expect(line?.textContent).toContain("supervision.goal.remainingTokens:3800")
  })

  test("shows no goal line for a review entry without a goal", () => {
    popoverMocks.rows = [
      {
        sessionId: "s-review",
        title: "Review session",
        state: "review",
        treeSessionIds: ["s-review"],
        projectId: "p1",
        projectLabel: "Project",
        directory: "/repo",
        updatedAt: 1,
        evidence: null,
        goal: null,
      },
    ]
    act(() => root.render(<NeedsYouPopover onClose={vi.fn()} />))
    expect(container.textContent).toContain("Review session")
    expect(container.querySelector("[data-goal-line]")).toBeNull()
  })
})
