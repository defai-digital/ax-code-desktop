import { previewLine } from "./activityPreview"
import { truncateToCodeUnits } from "@/lib/textTruncate"

import type { SupervisionRow } from "./rows"
import type { SupervisionState } from "./sessionState"

export interface ActivityFeedEvent {
  id: string
  sessionId: string
  title: string
  projectLabel: string | null
  directory: string | null
  from: SupervisionState | null
  to: SupervisionState
  at: number
  preview: string | null
  /** Set on project-browser events: agent access to this page origin turned on or off. `from` and `to` are the row's state. */
  browser?: { origin: string; enabled: boolean }
}

/**
 * Every state a stored event may name. Browser events carry the row's state at the time, whatever it was, so restoring
 * a record accepts the whole vocabulary. Which transitions the feed emits is ACTIVITY_FEED_OUTCOME_STATES.
 */
export const ACTIVITY_FEED_STATES: readonly SupervisionState[] = [
  "permission",
  "question",
  "goal",
  "error",
  "review",
  "idle",
  "running",
]

const ACTIVITY_FEED_STATE_SET: ReadonlySet<string> = new Set(ACTIVITY_FEED_STATES)

/**
 * The destinations a transition is recorded for: how a run ended, not how it got there.
 *
 * - goal, error: the run stopped on a blocked goal or a failure
 * - review, idle: a run settled, with or without changes to review
 *
 * A session passes through running, permission and question many times inside one run. Those are live state: Needs you,
 * the toasts and the dock badge already carry a pending request, and it is answered or stale within minutes, so a
 * ticket for it only teaches people to press "Mark all read". Startup is not a transition either: the first
 * observation of a session emits nothing.
 */
export const ACTIVITY_FEED_OUTCOME_STATES: readonly SupervisionState[] = ["goal", "error", "review", "idle"]

const ACTIVITY_FEED_OUTCOME_SET: ReadonlySet<string> = new Set(ACTIVITY_FEED_OUTCOME_STATES)

export function isActivityOutcomeState(value: unknown): value is SupervisionState {
  return typeof value === "string" && ACTIVITY_FEED_OUTCOME_SET.has(value)
}

/** Preview text stored on an event: one line, credential-filtered, then shortened. */
export const ACTIVITY_FEED_PREVIEW_LIMIT = 140

export const MAX_ACTIVITY_FEED_EVENTS = 200

export function isActivityFeedState(value: unknown): value is SupervisionState {
  return typeof value === "string" && ACTIVITY_FEED_STATE_SET.has(value)
}

/**
 * Activity text when the row has it, otherwise the row's error line. Neither path copies raw
 * message parts. Truncation counts UTF-16 code units and does not split a surrogate pair.
 */
export function activityFeedPreview(row: Pick<SupervisionRow, "activity" | "errorMessage">): string | null {
  const activityText = row.activity?.text
  const source =
    typeof activityText === "string" && activityText.length > 0
      ? activityText
      : typeof row.errorMessage === "string" && row.errorMessage.length > 0
        ? row.errorMessage
        : null
  if (source === null) return null
  // Runtime error text is not scrubbed upstream and the feed persists, so every preview passes the credential filter.
  const safe = previewLine(source)
  return safe === null ? null : truncateToCodeUnits(safe, ACTIVITY_FEED_PREVIEW_LIMIT)
}

/**
 * Transitions since the previous observation. Sessions absent from `previous` are a first
 * sighting and produce no event. Rows whose state did not change produce none either.
 * Simultaneous transitions share `now` and keep the incoming row order (the board's urgency order).
 */
export function diffActivityEvents(
  previous: ReadonlyMap<string, SupervisionState>,
  rows: readonly SupervisionRow[],
  now: number,
): ActivityFeedEvent[] {
  const events: ActivityFeedEvent[] = []
  for (const row of rows) {
    if (!row.sessionId || !previous.has(row.sessionId)) continue
    const from = previous.get(row.sessionId) ?? null
    if (from === row.state || !isActivityOutcomeState(row.state)) continue
    events.push({
      id: crypto.randomUUID(),
      sessionId: row.sessionId,
      title: row.title,
      projectLabel: row.projectLabel,
      directory: row.directory,
      from,
      to: row.state,
      at: now,
      preview: activityFeedPreview(row),
    })
  }
  return mergeActivityEvents([], events)
}

/** Newest `at` first. Equal timestamps keep the incoming batch ahead of the existing one. Caps the length. */
export function mergeActivityEvents(
  existing: readonly ActivityFeedEvent[],
  incoming: readonly ActivityFeedEvent[],
): ActivityFeedEvent[] {
  const ordered = [...incoming, ...existing].sort((left, right) => right.at - left.at)
  const seen = new Set<string>()
  const merged: ActivityFeedEvent[] = []
  for (const event of ordered) {
    if (seen.has(event.id)) continue
    seen.add(event.id)
    merged.push(event)
    if (merged.length === MAX_ACTIVITY_FEED_EVENTS) break
  }
  return merged
}

/** Per-session "seen" marks: the time the person last had that session in front of them. */
export type SessionSeenAt = Readonly<Record<string, number>>

/** An event is unread until the whole feed was marked read, or its session was looked at, after it happened. */
export function isUnreadActivity(event: ActivityFeedEvent, seenAt: number, sessionSeenAt: SessionSeenAt): boolean {
  return event.at > seenAt && event.at > (sessionSeenAt[event.sessionId] ?? 0)
}

export function countUnreadActivity(
  events: readonly ActivityFeedEvent[],
  seenAt: number,
  sessionSeenAt: SessionSeenAt,
): number {
  let count = 0
  for (const event of events) if (isUnreadActivity(event, seenAt, sessionSeenAt)) count += 1
  return count
}

/**
 * One unread ticket per session: the newest outcome replaces older unread ones for the same session, so a session that
 * ran, failed and ran again leaves one ticket rather than three. Read events stay as history, and project-browser
 * events are a separate stream that is never merged. Expects newest first, as mergeActivityEvents returns it.
 */
export function coalesceUnreadActivity(
  events: readonly ActivityFeedEvent[],
  seenAt: number,
  sessionSeenAt: SessionSeenAt,
): ActivityFeedEvent[] {
  const unreadSessions = new Set<string>()
  const result: ActivityFeedEvent[] = []
  for (const event of events) {
    if (!event.browser && isUnreadActivity(event, seenAt, sessionSeenAt)) {
      if (unreadSessions.has(event.sessionId)) continue
      unreadSessions.add(event.sessionId)
    }
    result.push(event)
  }
  return result
}
