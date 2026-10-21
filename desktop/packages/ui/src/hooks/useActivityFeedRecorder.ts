import React from "react"

import { diffActivityEvents } from "@/lib/supervision/activityFeed"
import type { SupervisionState } from "@/lib/supervision/sessionState"
import { useActivityFeedStore } from "@/stores/useActivityFeedStore"
import { useSupervisionRows } from "./useSupervisionRows"

/**
 * Records supervision transitions for the cross-session activity feed.
 * Mount once in the primary window. A disabled mount (the pop-out and other realms) does not
 * write, so the same transition is not stored twice. The first enabled snapshot is only a
 * baseline: sessions that appear then, or that were never in the previous map, do not emit.
 */
export function useActivityFeedRecorder(enabled = true): void {
  const rows = useSupervisionRows()
  const previous = React.useRef<ReadonlyMap<string, SupervisionState> | null>(null)

  React.useEffect(() => {
    if (!enabled) return
    const prior = previous.current
    previous.current = new Map(rows.map((row) => [row.sessionId, row.state]))
    if (!prior) return
    const events = diffActivityEvents(prior, rows, Date.now())
    if (events.length > 0) useActivityFeedStore.getState().record(events)
  }, [enabled, rows])
}
