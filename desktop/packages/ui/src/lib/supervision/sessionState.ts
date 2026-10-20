import { needsYouReason, type NeedsYouSessionInput } from "@/lib/needsYou"

/**
 * One supervision state per session, shared by the titlebar, the sidebar Live section, Mission Control
 * and the peek. Every input comes from what the runtime reports; nothing here is estimated.
 */
export type SupervisionState = "permission" | "question" | "error" | "goal" | "review" | "running" | "idle"

export interface SupervisionStateInput extends NeedsYouSessionInput {
  /** The runtime status type for the session: "busy", "retry" or "idle". */
  statusType?: string | null
}

/**
 * A blocked request wins. A session that is working again outranks an error the user has not looked at yet:
 * the unseen-error flag is only cleared when the user views the session, so it can be stale.
 */
export function deriveSupervisionState(input: SupervisionStateInput): SupervisionState {
  const reason = needsYouReason(input)
  if (reason === "permission" || reason === "question") return reason
  const running = input.statusType === "busy" || input.statusType === "retry"
  if (running) return "running"
  if (reason === "error") return "error"
  if (reason === "goal") return "goal"
  if (reason === "uncommitted") return "review"
  return "idle"
}

const URGENCY: Record<SupervisionState, number> = {
  permission: 0,
  question: 0,
  error: 1,
  goal: 2,
  review: 3,
  running: 4,
  idle: 5,
}

export function supervisionUrgency(state: SupervisionState): number {
  return URGENCY[state]
}

/**
 * Which state a session tree shows. A request anywhere in the tree wins; otherwise a tree that is still working
 * is running, even when a finished subagent left uncommitted changes or an error the parent is handling.
 */
const TREE_PRECEDENCE: Record<SupervisionState, number> = {
  permission: 0,
  question: 0,
  running: 1,
  error: 2,
  goal: 3,
  review: 4,
  idle: 5,
}

export function treeStatePrecedence(state: SupervisionState): number {
  return TREE_PRECEDENCE[state]
}

/** States that ask a person to do something. */
export function needsHuman(state: SupervisionState): boolean {
  return state === "permission" || state === "question" || state === "error" || state === "goal" || state === "review"
}

/** States that belong in a live view: anything that needs a person or is still working. */
export function isLiveState(state: SupervisionState): boolean {
  return state !== "idle"
}

/** Sessions that hold the user's attention: blocked on them or running on their turn. */
export function isHighTouchState(state: SupervisionState): boolean {
  return state === "permission" || state === "question" || state === "running"
}

export interface SupervisionEvidence {
  additions: number
  deletions: number
  files: number
}

type SummaryCount = number | string | null | undefined

export interface SessionSummaryLike {
  additions?: SummaryCount
  deletions?: SummaryCount
  files?: number | null
  diffs?: Array<{ additions?: SummaryCount; deletions?: SummaryCount }>
}

const toCount = (value: SummaryCount): number => {
  const parsed = typeof value === "string" ? Number.parseInt(value, 10) : value
  return typeof parsed === "number" && Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0
}

/** Diff evidence from the session summary the runtime reports. Null when there is none. */
export function resolveSupervisionEvidence(summary: SessionSummaryLike | null | undefined): SupervisionEvidence | null {
  if (!summary) return null
  const diffs = Array.isArray(summary.diffs) ? summary.diffs : []
  let additions = toCount(summary.additions)
  let deletions = toCount(summary.deletions)
  if (additions === 0 && deletions === 0 && diffs.length > 0) {
    for (const diff of diffs) {
      additions += toCount(diff.additions)
      deletions += toCount(diff.deletions)
    }
  }
  const files = toCount(summary.files ?? null) || diffs.length
  if (additions === 0 && deletions === 0 && files === 0) return null
  return { additions, deletions, files }
}

export interface SupervisionRowLike {
  sessionId: string
  state: SupervisionState
  updatedAt: number
}

/** Most urgent first; inside a tier, the oldest blocked request first and the most recent activity first otherwise. */
export function rankSupervisionRows<T extends SupervisionRowLike>(rows: readonly T[]): T[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const urgency = URGENCY[left.row.state] - URGENCY[right.row.state]
      if (urgency !== 0) return urgency
      const waiting = left.row.state === "permission" || left.row.state === "question"
      const byTime = waiting ? left.row.updatedAt - right.row.updatedAt : right.row.updatedAt - left.row.updatedAt
      return byTime || left.index - right.index
    })
    .map(({ row }) => row)
}

/**
 * The next session that needs a person after the current one, in urgency order, wrapping around.
 * Returns null when nothing needs a person.
 */
export function nextNeedsHumanSession(
  rows: readonly SupervisionRowLike[],
  currentSessionId: string | null,
): string | null {
  const ranked = rankSupervisionRows(rows.filter((row) => needsHuman(row.state)))
  if (ranked.length === 0) return null
  const index = currentSessionId ? ranked.findIndex((row) => row.sessionId === currentSessionId) : -1
  return ranked[(index + 1) % ranked.length]?.sessionId ?? null
}

export interface WorkInProgressSummary {
  running: number
  needsYou: number
  highTouch: number
  overSoftLimit: boolean
}

/** Above this many high-touch sessions, supervision quality drops; the UI hints but never blocks. */
export const HIGH_TOUCH_SOFT_LIMIT = 4

export function summarizeWorkInProgress(rows: readonly Pick<SupervisionRowLike, "state">[]): WorkInProgressSummary {
  let running = 0
  let needsYou = 0
  let highTouch = 0
  for (const row of rows) {
    if (row.state === "running") running += 1
    if (needsHuman(row.state)) needsYou += 1
    if (isHighTouchState(row.state)) highTouch += 1
  }
  return { running, needsYou, highTouch, overSoftLimit: highTouch > HIGH_TOUCH_SOFT_LIMIT }
}
