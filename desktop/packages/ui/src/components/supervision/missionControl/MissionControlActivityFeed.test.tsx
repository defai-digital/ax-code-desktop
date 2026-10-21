import React from "react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { ActivityFeedEvent } from "@/lib/supervision/activityFeed"
import { openSupervisedSession } from "@/lib/supervision/openSession"
import { useActivityFeedStore } from "@/stores/useActivityFeedStore"
import { useSupervisionStore } from "@/stores/useSupervisionStore"
import { cleanup, fireEvent, render, screen, within } from "@/test/dom"

vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      params ? `${key}:${Object.values(params).join("|")}` : key,
    relativeTime: (value: number, unit: string) => `${value} ${unit}`,
  }),
}))
vi.mock("@/hooks/useSupervisionRows", () => ({ useSupervisionRows: () => useSupervisionStore((state) => state.rows) }))
vi.mock("@/sync/sync-context", () => ({ useAllPendingRequests: () => [] }))
vi.mock("@/sync/session-actions", () => ({
  respondToPermission: vi.fn(),
  respondToQuestion: vi.fn(),
  rejectQuestion: vi.fn(),
}))
vi.mock("@/lib/supervision/openSession", () => ({ openSupervisedSession: vi.fn() }))
vi.mock("@/components/ui", () => ({ toast: { error: vi.fn() } }))

import { MissionControl } from "../MissionControl"
import { MissionControlActivityFeed } from "./MissionControlActivityFeed"

const NOW = 1_700_000_000_000

function feedEvent(overrides: Partial<ActivityFeedEvent> = {}): ActivityFeedEvent {
  return {
    id: "e1",
    sessionId: "s1",
    title: "Parser",
    projectLabel: "Desktop",
    directory: "/repo",
    from: "idle",
    to: "running",
    at: NOW - 120_000,
    preview: "Working on: the parser",
    ...overrides,
  }
}

describe("MissionControlActivityFeed", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    useActivityFeedStore.setState({ events: [], seenAt: 0 })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    useActivityFeedStore.setState({ events: [], seenAt: 0 })
  })

  test("shows an empty state", () => {
    render(<MissionControlActivityFeed onSelectSession={vi.fn()} />)
    expect(screen.getByText("supervision.missionControl.feed.empty")).toBeTruthy()
    expect(screen.queryByRole("list")).toBeNull()
  })

  test("lists newest first, marks unread events, and marks them read", () => {
    useActivityFeedStore.setState({
      events: [
        feedEvent({ id: "newer", title: "Newer task", at: NOW - 60_000 }),
        feedEvent({ id: "older", title: "Older task", at: NOW - 3_600_000, to: "error", preview: null, projectLabel: null }),
      ],
      seenAt: NOW - 120_000,
    })
    const onSelectSession = vi.fn()
    render(<MissionControlActivityFeed onSelectSession={onSelectSession} />)

    const list = screen.getByRole("list", { name: "supervision.missionControl.feed.listLabel" })
    const buttons = within(list).getAllByRole("button")
    expect(buttons.map((button) => button.getAttribute("data-activity-event"))).toEqual(["newer", "older"])
    expect(buttons[0]?.querySelector("[data-activity-unread]")?.getAttribute("aria-label")).toBe(
      "supervision.missionControl.feed.unread",
    )
    expect(buttons[1]?.querySelector("[data-activity-unread]")).toBeNull()
    expect(buttons[0]?.textContent).toContain("Newer task")
    expect(buttons[0]?.textContent).toContain("Desktop")
    expect(buttons[0]?.textContent).toContain("Working on: the parser")
    expect(buttons[0]?.textContent).toContain("-1 minute")
    expect(buttons[0]?.textContent).toContain("supervision.state.running")

    fireEvent.click(buttons[0]!)
    expect(onSelectSession).toHaveBeenCalledWith(expect.objectContaining({ id: "newer", sessionId: "s1" }))

    fireEvent.click(screen.getByRole("button", { name: "supervision.missionControl.feed.markAllRead" }))
    expect(screen.queryByRole("list")?.querySelector("[data-activity-unread]")).toBeNull()
    expect(useActivityFeedStore.getState().seenAt).toBe(NOW)
  })
})

describe("Mission Control activity column", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    vi.mocked(openSupervisedSession).mockClear()
    Element.prototype.scrollIntoView = vi.fn()
    useActivityFeedStore.setState({
      events: [feedEvent({ id: "feed-b", sessionId: "b", title: "Beta task", at: NOW - 60_000 })],
      seenAt: 0,
    })
    useSupervisionStore.setState({
      missionControlOpen: true,
      density: "comfortable",
      boardGroupBy: "none",
      workingSets: [],
      activeWorkingSetId: null,
      boardFocusSessionId: null,
      rows: ["a", "b"].map((sessionId) => ({
        sessionId,
        title: `Task ${sessionId}`,
        state: "running" as const,
        treeSessionIds: [sessionId],
        projectId: "p",
        projectLabel: "Project",
        directory: "/repo",
        updatedAt: NOW,
        evidence: null,
        goal: null,
      })),
    })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    useActivityFeedStore.setState({ events: [], seenAt: 0 })
    useSupervisionStore.setState({ rows: [], boardFocusSessionId: null })
  })

  test("toggles the feed and selects the session the way a row click does", () => {
    render(<MissionControl />)
    const toggle = screen.getByRole("button", { name: "supervision.missionControl.feed.toggleUnread:1" })
    expect(toggle.getAttribute("aria-pressed")).toBe("false")
    expect(toggle.querySelector("[data-activity-unread-count]")?.textContent).toBe("1")
    expect(document.querySelector("[data-activity-feed]")).toBeNull()

    fireEvent.click(toggle)
    expect(
      screen.getByRole("button", { name: "supervision.missionControl.feed.toggleUnread:1" }).getAttribute("aria-pressed"),
    ).toBe("true")
    const item = document.querySelector<HTMLButtonElement>("[data-activity-session='b']")
    expect(item).not.toBeNull()
    fireEvent.click(item!)
    expect(useSupervisionStore.getState().boardFocusSessionId).toBe("b")
    expect(document.querySelector("[role='grid']")?.getAttribute("aria-activedescendant")).toBe("mission-row-b")
    expect(openSupervisedSession).not.toHaveBeenCalled()
  })
})
