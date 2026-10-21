import React from "react"

import { diffActivityEvents } from "@/lib/supervision/activityFeed"
import { browserSessionUse, diffBrowserActivity, type BrowserSessionUse } from "@/lib/supervision/browserActivity"
import type { SupervisionState } from "@/lib/supervision/sessionState"
import { useActivityFeedStore } from "@/stores/useActivityFeedStore"
import { useWebMcpBrowserStore } from "@/stores/useWebMcpBrowserStore"
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

  // Project-browser access joins the same feed: when agent access to a page starts and stops.
  const sessionID = useWebMcpBrowserStore((state) => state.sessionID)
  const origin = useWebMcpBrowserStore((state) => state.origin)
  const browserEnabled = useWebMcpBrowserStore((state) => state.enabled)
  const ready = useWebMcpBrowserStore((state) => state.phase === "ready")
  const previousBrowser = React.useRef<BrowserSessionUse | null | undefined>(undefined)
  const rowsRef = React.useRef(rows)
  rowsRef.current = rows
  React.useEffect(() => {
    if (!enabled) return
    const next = browserSessionUse({ sessionID, origin, enabled: browserEnabled, ready })
    const events = diffBrowserActivity(previousBrowser.current, next, rowsRef.current, Date.now())
    previousBrowser.current = next
    if (events.length > 0) useActivityFeedStore.getState().record(events)
  }, [enabled, sessionID, origin, browserEnabled, ready])
}
