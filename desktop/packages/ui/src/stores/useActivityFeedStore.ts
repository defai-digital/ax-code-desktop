import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import {
  ACTIVITY_FEED_PREVIEW_LIMIT,
  coalesceUnreadActivity,
  countUnreadActivity,
  isActivityFeedState,
  isActivityOutcomeState,
  MAX_ACTIVITY_FEED_EVENTS,
  mergeActivityEvents,
  type ActivityFeedEvent,
  type SessionSeenAt,
} from "@/lib/supervision/activityFeed"
import { previewLine } from "@/lib/supervision/activityPreview"
import { truncateToCodeUnits } from "@/lib/textTruncate"
import { getSafeStorage } from "./utils/safeStorage"

export const ACTIVITY_FEED_STORAGE_KEY = "ax-code-activity-feed"

interface ActivityFeedState {
  events: ActivityFeedEvent[]
  seenAt: number
  /** When each session was last looked at; an event older than its session's mark is read. */
  sessionSeenAt: SessionSeenAt
  record: (events: readonly ActivityFeedEvent[]) => void
  markAllSeen: (now: number) => void
  markSessionSeen: (sessionId: string, now: number) => void
  clear: () => void
}

/** Unread events, with the same rule the feed list and the titlebar use. */
export const selectUnreadActivityCount = (state: Pick<ActivityFeedState, "events" | "seenAt" | "sessionSeenAt">): number =>
  countUnreadActivity(state.events, state.seenAt, state.sessionSeenAt)

function restorePreview(value: unknown): string | null | undefined {
  if (value === null) return null
  if (typeof value !== "string") return undefined
  // Records written before previews were credential-filtered are filtered again on restore.
  const safe = previewLine(value)
  return safe === null ? null : truncateToCodeUnits(safe, ACTIVITY_FEED_PREVIEW_LIMIT)
}

function restoreEvent(value: unknown): ActivityFeedEvent | null {
  if (!value || typeof value !== "object") return null
  const event = value as Partial<Record<keyof ActivityFeedEvent, unknown>>
  const { id, sessionId, title, projectLabel, directory, from, to, at } = event
  const preview = restorePreview(event.preview)
  if (typeof id !== "string" || id.length === 0) return null
  if (typeof sessionId !== "string" || sessionId.length === 0) return null
  if (typeof title !== "string") return null
  if (projectLabel !== null && typeof projectLabel !== "string") return null
  if (directory !== null && typeof directory !== "string") return null
  if (from !== null && !isActivityFeedState(from)) return null
  if (!isActivityFeedState(to)) return null
  if (typeof at !== "number" || !Number.isFinite(at)) return null
  if (preview === undefined) return null
  const restored: ActivityFeedEvent = { id, sessionId, title, projectLabel, directory, from, to, at, preview }
  const browser = event.browser as { origin?: unknown; enabled?: unknown } | undefined
  if (browser !== undefined) {
    if (!browser || typeof browser.origin !== "string" || browser.origin.length > 512 || typeof browser.enabled !== "boolean")
      return null
    restored.browser = { origin: browser.origin, enabled: browser.enabled }
  }
  return restored
}

function restoreEvents(input: unknown, seenAt: number, sessionSeenAt: SessionSeenAt): ActivityFeedEvent[] {
  if (!Array.isArray(input)) return []
  const events: ActivityFeedEvent[] = []
  for (const value of input) {
    const event = restoreEvent(value)
    // Records written before the feed kept outcomes only include run starts and pending requests; they were noise
    // then and would still count as unread, so they are dropped. Project-browser events are a separate stream.
    if (event && (event.browser || isActivityOutcomeState(event.to))) events.push(event)
  }
  const ordered = mergeActivityEvents(events, []).slice(0, MAX_ACTIVITY_FEED_EVENTS)
  return coalesceUnreadActivity(ordered, seenAt, sessionSeenAt)
}

function restoreSeenAt(input: unknown): number {
  return typeof input === "number" && Number.isFinite(input) ? input : 0
}

function restoreSessionSeenAt(input: unknown): SessionSeenAt {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {}
  const restored: Record<string, number> = {}
  for (const [sessionId, at] of Object.entries(input as Record<string, unknown>)) {
    if (sessionId.length > 0 && typeof at === "number" && Number.isFinite(at)) restored[sessionId] = at
  }
  return restored
}

/** A mark only matters while an event of its session is stored: drop the rest so the map stays bounded. */
function pruneSessionSeenAt(sessionSeenAt: SessionSeenAt, events: readonly ActivityFeedEvent[]): SessionSeenAt {
  const live = new Set(events.map((event) => event.sessionId))
  const pruned: Record<string, number> = {}
  for (const [sessionId, at] of Object.entries(sessionSeenAt)) if (live.has(sessionId)) pruned[sessionId] = at
  return pruned
}

export const useActivityFeedStore = create<ActivityFeedState>()(
  persist(
    (set) => ({
      events: [],
      seenAt: 0,
      sessionSeenAt: {},
      record: (events) => {
        if (events.length === 0) return
        set((state) => ({
          events: coalesceUnreadActivity(mergeActivityEvents(state.events, events), state.seenAt, state.sessionSeenAt),
        }))
      },
      markAllSeen: (now) => {
        if (typeof now !== "number" || !Number.isFinite(now)) return
        set({ seenAt: now })
      },
      markSessionSeen: (sessionId, now) => {
        if (!sessionId || typeof now !== "number" || !Number.isFinite(now)) return
        set((state) => {
          if ((state.sessionSeenAt[sessionId] ?? 0) >= now) return state
          if (!state.events.some((event) => event.sessionId === sessionId && event.at > state.seenAt)) return state
          return { sessionSeenAt: { ...state.sessionSeenAt, [sessionId]: now } }
        })
      },
      clear: () => set({ events: [], seenAt: 0, sessionSeenAt: {} }),
    }),
    {
      name: ACTIVITY_FEED_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => getSafeStorage()),
      partialize: (state) => ({
        events: state.events,
        seenAt: state.seenAt,
        sessionSeenAt: pruneSessionSeenAt(state.sessionSeenAt, state.events),
      }),
      merge: (persisted, current) => {
        const stored = persisted as Partial<ActivityFeedState> | null
        const seenAt = restoreSeenAt(stored?.seenAt)
        const sessionSeenAt = restoreSessionSeenAt(stored?.sessionSeenAt)
        const events = restoreEvents(stored?.events, seenAt, sessionSeenAt)
        return { ...current, events, seenAt, sessionSeenAt: pruneSessionSeenAt(sessionSeenAt, events) }
      },
    },
  ),
)

// Only the main window records; another window (the pop-out board) follows its writes, so its unread count stays current and
// its "Mark all read" does not write back an older event list.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === ACTIVITY_FEED_STORAGE_KEY) void useActivityFeedStore.persist.rehydrate()
  })
}
