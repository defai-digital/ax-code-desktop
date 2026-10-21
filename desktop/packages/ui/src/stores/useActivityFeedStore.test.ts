import { beforeEach, describe, expect, test } from "vitest"
import { createJSONStorage } from "zustand/middleware"
import { MAX_ACTIVITY_FEED_EVENTS, type ActivityFeedEvent } from "@/lib/supervision/activityFeed"
import { ACTIVITY_FEED_STORAGE_KEY, useActivityFeedStore } from "./useActivityFeedStore"

const ACTIVITY_FEED_PREVIEW_TOO_LONG = 400

function event(id: string, at: number, overrides: Partial<ActivityFeedEvent> = {}): ActivityFeedEvent {
  return {
    id,
    sessionId: "s1",
    title: "Parser",
    projectLabel: "Desktop",
    directory: "/repo",
    from: "idle",
    to: "running",
    at,
    preview: "working",
    ...overrides,
  }
}

describe("activity feed persistence", () => {
  const storage = new Map<string, string>()

  beforeEach(() => {
    storage.clear()
    useActivityFeedStore.persist.setOptions({
      storage: createJSONStorage(() => ({
        getItem: (name) => storage.get(name) ?? null,
        setItem: (name, value) => {
          storage.set(name, value)
        },
        removeItem: (name) => {
          storage.delete(name)
        },
      })),
    })
    useActivityFeedStore.setState({ events: [], seenAt: 0 })
  })

  test("keeps the newest events and caps the recorded list", () => {
    const batch = Array.from({ length: MAX_ACTIVITY_FEED_EVENTS + 1 }, (_, index) => event(String(index), index))
    useActivityFeedStore.getState().record(batch)
    const events = useActivityFeedStore.getState().events
    expect(events).toHaveLength(MAX_ACTIVITY_FEED_EVENTS)
    expect(events[0]?.id).toBe(String(MAX_ACTIVITY_FEED_EVENTS))
    expect(events.some((item) => item.id === "0")).toBe(false)
    useActivityFeedStore.getState().markAllSeen(80)
    expect(useActivityFeedStore.getState().seenAt).toBe(80)
    useActivityFeedStore.getState().clear()
    expect(useActivityFeedStore.getState()).toMatchObject({ events: [], seenAt: 0 })
  })

  test("drops malformed records, caps restored events, and keeps the actions", async () => {
    const events = Array.from({ length: MAX_ACTIVITY_FEED_EVENTS + 5 }, (_, index) => event(String(index + 1), index + 1))
    storage.set(
      ACTIVITY_FEED_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        state: {
          events: [
            ...events,
            { id: "broken" },
            null,
            "nope",
            { ...event("bad-to", 9), to: "archived" },
            { ...event("bad-preview", 8), preview: 12 },
            { ...event("long", 7), preview: "x".repeat(ACTIVITY_FEED_PREVIEW_TOO_LONG) },
          ],
          seenAt: "yesterday",
        },
      }),
    )
    await useActivityFeedStore.persist.rehydrate()
    const restored = useActivityFeedStore.getState()
    expect(restored.events).toHaveLength(MAX_ACTIVITY_FEED_EVENTS)
    expect(restored.events.some((item) => item.id === "broken" || item.id === "bad-to" || item.id === "bad-preview")).toBe(
      false,
    )
    expect(restored.events[0]?.id).toBe(String(MAX_ACTIVITY_FEED_EVENTS + 5))
    expect(restored.events.some((item) => item.id === "1")).toBe(false)
    const long = restored.events.find((item) => item.id === "long")
    expect(long?.preview?.length).toBeLessThanOrEqual(140)
    expect(restored.seenAt).toBe(0)
    restored.markAllSeen(4)
    expect(useActivityFeedStore.getState().seenAt).toBe(4)
  })

  test("filters credentials out of restored previews and follows another window's writes", async () => {
    storage.set(
      ACTIVITY_FEED_STORAGE_KEY,
      JSON.stringify({ version: 1, state: { events: [{ ...event("leak", 3), preview: "password=supersecret123" }], seenAt: 0 } }),
    )
    await useActivityFeedStore.persist.rehydrate()
    expect(useActivityFeedStore.getState().events[0]?.preview).toBeNull()
    storage.set(ACTIVITY_FEED_STORAGE_KEY, JSON.stringify({ version: 1, state: { events: [event("newer", 9)], seenAt: 4 } }))
    window.dispatchEvent(new StorageEvent("storage", { key: ACTIVITY_FEED_STORAGE_KEY }))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(useActivityFeedStore.getState().events.map((item) => item.id)).toEqual(["newer"])
    expect(useActivityFeedStore.getState().seenAt).toBe(4)
  })

  test("restores browser events and drops malformed browser fields", async () => {
    storage.set(
      ACTIVITY_FEED_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        state: {
          events: [
            { ...event("ok", 3), browser: { origin: "https://shop.test", enabled: true } },
            { ...event("bad", 2), browser: { origin: 5, enabled: true } },
          ],
          seenAt: 0,
        },
      }),
    )
    await useActivityFeedStore.persist.rehydrate()
    expect(useActivityFeedStore.getState().events.map((item) => [item.id, item.browser])).toEqual([
      ["ok", { origin: "https://shop.test", enabled: true }],
    ])
  })
})
