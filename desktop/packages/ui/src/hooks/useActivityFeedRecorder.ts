import React from "react"

import { diffActivityEvents, isUnreadActivity } from "@/lib/supervision/activityFeed"
import { browserSessionUse, diffBrowserActivity, type BrowserSessionUse } from "@/lib/supervision/browserActivity"
import type { SupervisionState } from "@/lib/supervision/sessionState"
import { useActivityFeedStore } from "@/stores/useActivityFeedStore"
import { useSupervisionStore } from "@/stores/useSupervisionStore"
import { useSessionUIStore } from "@/sync/session-ui-store"
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

  // A session the person is looking at needs no ticket for what happened in front of them, so opening it (or a run
  // finishing while it is open) reads its tickets. A hidden window, or the board covering the chat, is not looking.
  const currentSessionId = useSessionUIStore((state) => state.currentSessionId)
  const boardOpen = useSupervisionStore((state) => state.missionControlOpen)
  const hasUnreadForCurrent = useActivityFeedStore((state) =>
    currentSessionId
      ? state.events.some((event) => event.sessionId === currentSessionId && isUnreadActivity(event, state.seenAt, state.sessionSeenAt))
      : false,
  )
  React.useEffect(() => {
    if (!enabled || !currentSessionId || boardOpen || !hasUnreadForCurrent) return
    const markSeen = () => {
      if (document.hidden) return
      useActivityFeedStore.getState().markSessionSeen(currentSessionId, Date.now())
    }
    markSeen()
    document.addEventListener("visibilitychange", markSeen)
    return () => document.removeEventListener("visibilitychange", markSeen)
  }, [enabled, currentSessionId, boardOpen, hasUnreadForCurrent])

  // Project-browser access joins the same feed: when agent access to a page starts and stops.
  const sessionID = useWebMcpBrowserStore((state) => state.sessionID)
  const origin = useWebMcpBrowserStore((state) => state.origin)
  const browserEnabled = useWebMcpBrowserStore((state) => state.enabled)
  const ready = useWebMcpBrowserStore((state) => state.phase === "ready")
  const views = useWebMcpBrowserStore((state) => state.views)
  const previousBrowser = React.useRef<Map<string, BrowserSessionUse | null> | undefined>(undefined)
  const rowsRef = React.useRef(rows)
  rowsRef.current = rows
  React.useEffect(() => {
    if (!enabled) return
    const next = new Map(
      Object.entries(views).map(([key, view]) => [key, browserSessionUse({ ...view, ready: view.phase === "ready" })]),
    )
    if (next.size === 0) next.set("legacy", browserSessionUse({ sessionID, origin, enabled: browserEnabled, ready }))
    const prior = previousBrowser.current
    const events = [...new Set([...next.keys(), ...(prior?.keys() ?? [])])].flatMap((key) =>
      diffBrowserActivity(
        prior ? (prior.get(key) ?? null) : undefined,
        next.get(key) ?? null,
        rowsRef.current,
        Date.now(),
      ),
    )
    previousBrowser.current = next
    if (events.length > 0) useActivityFeedStore.getState().record(events)
  }, [enabled, views, sessionID, origin, browserEnabled, ready])
}
