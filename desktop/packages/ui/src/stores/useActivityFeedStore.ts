import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import {
  ACTIVITY_FEED_PREVIEW_LIMIT,
  isActivityFeedState,
  MAX_ACTIVITY_FEED_EVENTS,
  mergeActivityEvents,
  type ActivityFeedEvent,
} from "@/lib/supervision/activityFeed"
import { previewLine } from "@/lib/supervision/activityPreview"
import { truncateToCodeUnits } from "@/lib/textTruncate"
import { getSafeStorage } from "./utils/safeStorage"

export const ACTIVITY_FEED_STORAGE_KEY = "ax-code-activity-feed"

interface ActivityFeedState {
  events: ActivityFeedEvent[]
  seenAt: number
  record: (events: readonly ActivityFeedEvent[]) => void
  markAllSeen: (now: number) => void
  clear: () => void
}

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
  return { id, sessionId, title, projectLabel, directory, from, to, at, preview }
}

function restoreEvents(input: unknown): ActivityFeedEvent[] {
  if (!Array.isArray(input)) return []
  const events: ActivityFeedEvent[] = []
  for (const value of input) {
    const event = restoreEvent(value)
    if (event) events.push(event)
  }
  return mergeActivityEvents(events, []).slice(0, MAX_ACTIVITY_FEED_EVENTS)
}

function restoreSeenAt(input: unknown): number {
  return typeof input === "number" && Number.isFinite(input) ? input : 0
}

export const useActivityFeedStore = create<ActivityFeedState>()(
  persist(
    (set) => ({
      events: [],
      seenAt: 0,
      record: (events) => {
        if (events.length === 0) return
        set((state) => ({ events: mergeActivityEvents(state.events, events) }))
      },
      markAllSeen: (now) => {
        if (typeof now !== "number" || !Number.isFinite(now)) return
        set({ seenAt: now })
      },
      clear: () => set({ events: [], seenAt: 0 }),
    }),
    {
      name: ACTIVITY_FEED_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => getSafeStorage()),
      partialize: (state) => ({ events: state.events, seenAt: state.seenAt }),
      merge: (persisted, current) => {
        const stored = persisted as Partial<ActivityFeedState> | null
        return {
          ...current,
          events: restoreEvents(stored?.events),
          seenAt: restoreSeenAt(stored?.seenAt),
        }
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
