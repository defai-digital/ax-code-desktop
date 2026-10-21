import type { ActivityFeedEvent } from "./activityFeed"
import type { SupervisionRow } from "./rows"

/** What Mission Control needs from the project browser projection; one browser exists at a time. */
export interface BrowserSessionSnapshot {
  sessionID: string | null
  origin: string | null
  enabled: boolean
  ready: boolean
}

export interface BrowserSessionUse {
  sessionId: string
  origin: string
  enabled: boolean
}

/** The page a session's project browser shows, or null when it has none (no session, not ready, or no page with an origin). */
export function browserSessionUse(snapshot: BrowserSessionSnapshot): BrowserSessionUse | null {
  if (!snapshot.ready || !snapshot.sessionID || !snapshot.origin) return null
  return { sessionId: snapshot.sessionID, origin: snapshot.origin, enabled: snapshot.enabled }
}

/**
 * Activity-feed events for agent browser access starting and stopping. Only access changes are recorded, not every page
 * load: turning access on (or moving it to another origin while on) and turning it off. The first observation is a baseline.
 */
export function diffBrowserActivity(
  previous: BrowserSessionUse | null | undefined,
  next: BrowserSessionUse | null,
  rows: readonly SupervisionRow[],
  now: number,
): ActivityFeedEvent[] {
  if (previous === undefined) return []
  const event = (use: BrowserSessionUse, enabled: boolean): ActivityFeedEvent[] => {
    const row = rows.find((candidate) => candidate.sessionId === use.sessionId)
    if (!row) return []
    return [
      {
        id: `${use.sessionId}:browser:${now}:${enabled ? "on" : "off"}`,
        sessionId: use.sessionId,
        title: row.title,
        projectLabel: row.projectLabel,
        directory: row.directory,
        from: row.state,
        to: row.state,
        at: now,
        preview: null,
        browser: { origin: use.origin, enabled },
      },
    ]
  }
  const wasOn = previous?.enabled ? previous : null
  const isOn = next?.enabled ? next : null
  if (wasOn && isOn && wasOn.sessionId === isOn.sessionId && wasOn.origin === isOn.origin) return []
  return [...(wasOn ? event(wasOn, false) : []), ...(isOn ? event(isOn, true) : [])]
}
