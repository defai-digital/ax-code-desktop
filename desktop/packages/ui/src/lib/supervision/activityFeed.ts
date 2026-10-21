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
}

/**
 * Destination states worth a supervisor's attention. The names come from sessionState.ts:
 *
 * - permission, question: the session is blocked on the person
 * - goal, error: it needs a person because a goal or a failure is waiting (needsHuman)
 * - review, idle: done-like finishes (a run that settled, with or without changes to review)
 * - running: a run starting, so work that began while the supervisor was away is visible
 *
 * A state added to the SupervisionState union later stays out of the feed until it is listed
 * here. Startup is not a transition: the first observation of a session emits nothing.
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
    if (from === row.state || !isActivityFeedState(row.state)) continue
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
