import { afterEach, describe, expect, test, vi } from "vitest"
import React, { act } from "react"
import { cleanup, fireEvent, render, screen } from "@/test/dom"
import type { SupervisionRow } from "@/lib/supervision/rows"

const rows = vi.hoisted(() => ({ value: [] as SupervisionRow[] }))
vi.mock("@/hooks/useSupervisionRows", () => ({ useSupervisionRows: () => rows.value }))
vi.mock("@/lib/supervision/openSession", () => ({ openSupervisedSession: vi.fn() }))
// Counts feed item renders: the feed formats each event's time once per render.
const feedRenders = vi.hoisted(() => ({ count: 0 }))
vi.mock("@/lib/supervision/sinceYouLeft", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supervision/sinceYouLeft")>()
  return {
    ...actual,
    sinceYouLeftRelativeParts: (...args: Parameters<typeof actual.sinceYouLeftRelativeParts>) => {
      feedRenders.count += 1
      return actual.sinceYouLeftRelativeParts(...args)
    },
  }
})
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
import { shouldStartWindowDrag } from "@/lib/windowDrag"
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
  vi.clearAllMocks()
  feedRenders.count = 0
  useActivityFeedStore.setState({ events: [], seenAt: 0 })
})

describe("titlebar Activity button", () => {
  test("streamed row updates do not re-render the open feed, and a choice still uses the latest rows", () => {
    const row = (projectId: string): SupervisionRow => ({
      sessionId: "s1", title: "Task s1", state: "running", treeSessionIds: ["s1"], projectId, projectLabel: "P",
      directory: "/repo", updatedAt: 1, evidence: null, goal: null,
    })
    rows.value = [row("p-old")]
    useActivityFeedStore.setState({ events: Array.from({ length: 50 }, (_, i) => event("s1", 100 - i)), seenAt: 0 })
    let bump: () => void = () => {}
    function Host() {
      const [, setTick] = React.useState(0)
      bump = () => setTick((tick) => tick + 1)
      return <ActivityButton />
    }
    const { container } = render(<Host />)
    fireEvent.click(screen.getByRole("button", { name: "supervision.missionControl.feed.toggleUnread:50" }))
    const afterOpen = feedRenders.count
    expect(afterOpen).toBeGreaterThan(0)
    for (let update = 0; update < 20; update += 1) {
      rows.value = [row(`p-${update}`)]
      act(() => bump())
    }
    expect(feedRenders.count).toBe(afterOpen)
    fireEvent.click(container.querySelector<HTMLButtonElement>("[data-activity-session='s1']")!)
    expect(openSupervisedSession).toHaveBeenLastCalledWith({ sessionId: "s1", projectId: "p-19", directory: "/repo" })
  })

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

  test("a press on the open feed's backdrop is not a window drag, so the click that closes it lands", () => {
    rows.value = []
    const starts: boolean[] = []
    const { container } = render(
      <div onMouseDown={(event) => starts.push(shouldStartWindowDrag(event.target as Element, event.button))}>
        <ActivityButton />
      </div>,
    )
    fireEvent.click(screen.getByRole("button", { name: "supervision.missionControl.feed.toggle" }))
    const backdrop = container.querySelector<HTMLElement>(".fixed.inset-0")!
    act(() => {
      backdrop.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }))
    })
    expect(starts).toEqual([false])
    fireEvent.click(backdrop)
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})
