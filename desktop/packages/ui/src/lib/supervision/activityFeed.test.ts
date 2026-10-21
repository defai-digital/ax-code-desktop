import { describe, expect, test } from "vitest"
import type { SupervisionRow } from "./rows"
import type { SupervisionState } from "./sessionState"
import {
  ACTIVITY_FEED_PREVIEW_LIMIT,
  ACTIVITY_FEED_STATES,
  activityFeedPreview,
  diffActivityEvents,
  MAX_ACTIVITY_FEED_EVENTS,
  mergeActivityEvents,
  type ActivityFeedEvent,
} from "./activityFeed"

function row(overrides: Partial<SupervisionRow> & Pick<SupervisionRow, "state">): SupervisionRow {
  const sessionId = overrides.sessionId ?? "s1"
  return {
    sessionId,
    title: "Parser",
    treeSessionIds: [sessionId],
    projectId: "p",
    projectLabel: "Desktop",
    directory: "/repo",
    updatedAt: 1,
    evidence: null,
    goal: null,
    ...overrides,
  }
}

function event(id: string, at: number): ActivityFeedEvent {
  return {
    id,
    sessionId: id,
    title: id,
    projectLabel: null,
    directory: null,
    from: "idle",
    to: "running",
    at,
    preview: null,
  }
}

describe("diffActivityEvents", () => {
  test("does not record the first observation of a session", () => {
    const previous = new Map<string, SupervisionState>()
    const events = diffActivityEvents(previous, [row({ state: "running" }), row({ sessionId: "s2", state: "error" })], 10)
    expect(events).toEqual([])
  })

  test("records a state change and ignores a session that was not seen before", () => {
    const previous = new Map<string, SupervisionState>([["s1", "idle"]])
    const events = diffActivityEvents(
      previous,
      [row({ state: "running", activity: { kind: "todo", text: "Working on: the parser" } }), row({ sessionId: "s2", state: "error" })],
      20,
    )
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      sessionId: "s1",
      title: "Parser",
      projectLabel: "Desktop",
      directory: "/repo",
      from: "idle",
      to: "running",
      at: 20,
      preview: "Working on: the parser",
    })
    expect(events[0]?.id).toEqual(expect.any(String))
  })

  test("ignores a row whose state did not change", () => {
    const previous = new Map<string, SupervisionState>([["s1", "running"]])
    const events = diffActivityEvents(
      previous,
      [row({ state: "running", activity: { kind: "message", text: "a later line" } })],
      30,
    )
    expect(events).toEqual([])
  })

  test("records each destination a supervisor watches", () => {
    for (const state of ACTIVITY_FEED_STATES) {
      const events = diffActivityEvents(new Map([["s1", state === "idle" ? "running" : "idle"]]), [row({ state })], 40)
      expect(events.map((item) => item.to)).toEqual([state])
    }
  })

  test("ignores a destination outside the supervision vocabulary", () => {
    const events = diffActivityEvents(
      new Map([["s1", "idle"]]),
      [row({ state: "archived" as SupervisionState })],
      50,
    )
    expect(events).toEqual([])
  })

  test("keeps simultaneous transitions in row order", () => {
    const previous = new Map<string, SupervisionState>([
      ["s1", "idle"],
      ["s2", "running"],
    ])
    const events = diffActivityEvents(
      previous,
      [row({ state: "question" }), row({ sessionId: "s2", title: "Other", state: "review" })],
      60,
    )
    expect(events.map((item) => item.sessionId)).toEqual(["s1", "s2"])
    expect(events.every((item) => item.at === 60)).toBe(true)
  })
})

describe("activityFeedPreview", () => {
  test("prefers activity text over the error line", () => {
    expect(
      activityFeedPreview({
        activity: { kind: "message", text: "Reset the parser" },
        errorMessage: "boom",
      }),
    ).toBe("Reset the parser")
  })

  test("uses the error line when the row has no activity text", () => {
    expect(activityFeedPreview({ activity: null, errorMessage: "boom" })).toBe("boom")
    expect(activityFeedPreview({ activity: { kind: "message", text: "" }, errorMessage: "boom" })).toBe("boom")
    expect(activityFeedPreview({})).toBeNull()
  })

  test("truncates to 140 code units without splitting an emoji", () => {
    const emoji = "😀"
    const text = `${"a".repeat(138)}${emoji}${"b".repeat(40)}`
    const preview = activityFeedPreview({ activity: { kind: "message", text } })
    expect(preview).not.toBeNull()
    expect(preview!.length).toBeLessThanOrEqual(ACTIVITY_FEED_PREVIEW_LIMIT)
    expect(preview!.endsWith("…")).toBe(true)
    expect(preview).not.toContain("\uD83D")
    expect(activityFeedPreview({ activity: { kind: "message", text: "a".repeat(ACTIVITY_FEED_PREVIEW_LIMIT) } })).toHaveLength(
      ACTIVITY_FEED_PREVIEW_LIMIT,
    )
  })
})

describe("mergeActivityEvents", () => {
  test("keeps the newest event first and drops duplicates", () => {
    const merged = mergeActivityEvents([event("old", 1), event("same", 5)], [event("new", 9), event("same", 5)])
    expect(merged.map((item) => item.id)).toEqual(["new", "same", "old"])
  })

  test("caps the feed and drops the oldest", () => {
    const existing = Array.from({ length: MAX_ACTIVITY_FEED_EVENTS }, (_, index) => event(`e${index}`, index))
    const merged = mergeActivityEvents(existing, [event("fresh", MAX_ACTIVITY_FEED_EVENTS + 5)])
    expect(merged).toHaveLength(MAX_ACTIVITY_FEED_EVENTS)
    expect(merged[0]?.id).toBe("fresh")
    expect(merged.some((item) => item.id === "e0")).toBe(false)
    expect(merged.at(-1)?.id).toBe("e1")
  })

})

describe("activityFeedPreview credential filter", () => {
  test("drops an error line that carries a credential and keeps an ordinary one", () => {
    expect(activityFeedPreview({ errorMessage: "auth failed: token=abcdefghijk12345" })).toBeNull()
    expect(activityFeedPreview({ errorMessage: "Bearer abcdefghijklmnopqrstuvwxyz rejected" })).toBeNull()
    expect(activityFeedPreview({ errorMessage: "Build failed\nsecond line" })).toBe("Build failed")
  })
})
