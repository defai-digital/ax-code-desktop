import { describe, expect, test } from "vitest"
import type { SupervisionRow } from "./rows"
import type { SupervisionState } from "./sessionState"
import {
  ACTIVITY_FEED_PREVIEW_LIMIT,
  ACTIVITY_FEED_OUTCOME_STATES,
  activityFeedPreview,
  coalesceUnreadActivity,
  countUnreadActivity,
  diffActivityEvents,
  isUnreadActivity,
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
    to: "review",
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
    const previous = new Map<string, SupervisionState>([["s1", "running"]])
    const events = diffActivityEvents(
      previous,
      [row({ state: "review", activity: { kind: "todo", text: "Working on: the parser" } }), row({ sessionId: "s2", state: "error" })],
      20,
    )
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      sessionId: "s1",
      title: "Parser",
      projectLabel: "Desktop",
      directory: "/repo",
      from: "running",
      to: "review",
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

  test("records how a run ended: a blocked goal, a failure, or a run that settled", () => {
    for (const state of ACTIVITY_FEED_OUTCOME_STATES) {
      const events = diffActivityEvents(new Map([["s1", "running"]]), [row({ state })], 40)
      expect(events.map((item) => item.to)).toEqual([state])
    }
  })

  test("does not record a run starting or a request opening: that is live state, not an outcome", () => {
    for (const state of ["running", "permission", "question"] as const) {
      expect(diffActivityEvents(new Map([["s1", "idle"]]), [row({ state })], 45)).toEqual([])
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
      [row({ state: "error" }), row({ sessionId: "s2", title: "Other", state: "review" })],
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

describe("unread tickets", () => {
  const at = (sessionId: string, time: number, extra: Partial<ActivityFeedEvent> = {}): ActivityFeedEvent => ({
    ...event(sessionId, time),
    id: `${sessionId}-${time}`,
    sessionId,
    ...extra,
  })

  test("an event is unread until the feed or its own session was read after it", () => {
    const first = at("a", 100)
    expect(isUnreadActivity(first, 0, {})).toBe(true)
    expect(isUnreadActivity(first, 100, {})).toBe(false)
    expect(isUnreadActivity(first, 0, { a: 150 })).toBe(false)
    // Looking at another session does not read this one.
    expect(isUnreadActivity(first, 0, { b: 150 })).toBe(true)
    // An event newer than the mark is unread again.
    expect(isUnreadActivity(at("a", 200), 0, { a: 150 })).toBe(true)
  })

  test("counts only unread events", () => {
    const events = [at("a", 300), at("b", 200), at("c", 100)]
    expect(countUnreadActivity(events, 150, { a: 400 })).toBe(1)
  })

  test("keeps one unread ticket per session, the newest, and leaves read history alone", () => {
    const events = [at("a", 400), at("b", 350), at("a", 300), at("a", 100), at("b", 90)]
    // Session a was read at 200: its events at 100 are history, those after are unread; b was never read.
    const kept = coalesceUnreadActivity(events, 0, { a: 200 })
    expect(kept.map((item) => item.id)).toEqual(["a-400", "b-350", "a-100"])
  })

  test("never merges project-browser events", () => {
    const browser = (time: number) => at("a", time, { browser: { origin: "https://x.test", enabled: true } })
    const kept = coalesceUnreadActivity([browser(300), at("a", 250), browser(200), at("a", 100)], 0, {})
    expect(kept.map((item) => item.id)).toEqual(["a-300", "a-250", "a-200"])
  })
})
