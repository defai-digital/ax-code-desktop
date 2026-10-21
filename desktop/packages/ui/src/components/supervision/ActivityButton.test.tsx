import { afterEach, describe, expect, test, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@/test/dom"
import type { SupervisionRow } from "@/lib/supervision/rows"

const rows = vi.hoisted(() => ({ value: [] as SupervisionRow[] }))
vi.mock("@/hooks/useSupervisionRows", () => ({ useSupervisionRows: () => rows.value }))
vi.mock("@/lib/supervision/openSession", () => ({ openSupervisedSession: vi.fn() }))
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      params ? `${key}:${Object.values(params).join("|")}` : key,
    relativeTime: () => "now",
  }),
}))
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: () => null,
}))
import { openSupervisedSession } from "@/lib/supervision/openSession"
import { useActivityFeedStore } from "@/stores/useActivityFeedStore"
import { ActivityButton } from "./ActivityButton"

const event = (sessionId: string, at: number) => ({
  id: `e-${sessionId}-${at}`,
  sessionId,
  title: `Task ${sessionId}`,
  projectLabel: null,
  directory: "/repo",
  from: "running" as const,
  to: "question" as const,
  at,
  preview: null,
})

afterEach(() => {
  cleanup()
  useActivityFeedStore.setState({ events: [], seenAt: 0 })
})

describe("titlebar Activity button", () => {
  test("shows the unread count and opens a feed item's session from anywhere; an unknown session is not substituted", () => {
    rows.value = [
      { sessionId: "s1", title: "Task s1", state: "question", treeSessionIds: ["s1"], projectId: "p", projectLabel: "P", directory: "/repo", updatedAt: 1, evidence: null, goal: null },
    ]
    useActivityFeedStore.setState({ events: [event("s1", 10), event("gone", 9)], seenAt: 5 })
    const { container } = render(<ActivityButton />)
    const button = screen.getByRole("button", { name: "supervision.missionControl.feed.toggleUnread:2" })
    fireEvent.click(button)
    fireEvent.click(container.querySelector<HTMLButtonElement>("[data-activity-session='gone']")!)
    expect(openSupervisedSession).not.toHaveBeenCalled()
    fireEvent.click(container.querySelector<HTMLButtonElement>("[data-activity-session='s1']")!)
    expect(openSupervisedSession).toHaveBeenCalledWith({ sessionId: "s1", projectId: "p", directory: "/repo" })
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  test("focus moves into the panel when it opens and back to the button when Escape closes it", () => {
    rows.value = []
    useActivityFeedStore.setState({ events: [], seenAt: 0 })
    render(<ActivityButton />)
    const button = screen.getByRole("button", { name: "supervision.missionControl.feed.toggle" })
    button.focus()
    fireEvent.click(button)
    expect(document.activeElement).toBe(screen.getByRole("dialog"))
    fireEvent.keyDown(document.body, { key: "Escape" })
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(document.activeElement).toBe(button)
  })
})
