/**
 * The runtime's durable goal for one session (SDK `session.goal` route and event). Desktop shows the runtime's
 * status verbatim: it does not judge whether an objective was met and does not infer a status the runtime did
 * not report.
 */
export const SESSION_GOAL_STATUSES = ["active", "paused", "complete", "blocked", "budget_limited"] as const

export type SessionGoalStatus = (typeof SESSION_GOAL_STATUSES)[number]

export interface SessionGoalSnapshot {
  sessionId: string
  objective: string
  status: SessionGoalStatus
  tokensUsed: number
  timeUsedSeconds: number
  tokenBudget?: number
  timeBudgetSeconds?: number
  remainingTokens?: number
  remainingTimeSeconds?: number
  planPath?: string
  createdAt: number
  updatedAt?: number
}

const STATUS_SET: ReadonlySet<string> = new Set(SESSION_GOAL_STATUSES)

/** Longest objective kept; the runtime's objective can be a long paragraph and rows show a short line. */
export const SESSION_GOAL_OBJECTIVE_LIMIT = 500

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const nonNegativeNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined

/**
 * Validates one goal payload from the runtime (route response or event). Returns null for a null goal and for
 * anything that does not carry a session id, a non-empty objective and a known status, so a malformed or newer
 * payload never produces a row annotation.
 */
export function normalizeSessionGoal(value: unknown): SessionGoalSnapshot | null {
  if (!isRecord(value)) return null
  const sessionId = typeof value.sessionID === "string" ? value.sessionID.trim() : ""
  const objective = typeof value.objective === "string" ? value.objective.trim() : ""
  const status = typeof value.status === "string" ? value.status : ""
  if (!sessionId || !objective || !STATUS_SET.has(status)) return null
  const time = isRecord(value.time) ? value.time : {}
  const createdAt = nonNegativeNumber(time.created)
  if (createdAt === undefined) return null
  const updatedAt = nonNegativeNumber(time.updated)
  const tokenBudget = nonNegativeNumber(value.tokenBudget)
  const timeBudgetSeconds = nonNegativeNumber(value.timeBudgetSeconds)
  const remainingTokens = nonNegativeNumber(value.remainingTokens)
  const remainingTimeSeconds = nonNegativeNumber(value.remainingTimeSeconds)
  const planPath = typeof value.planPath === "string" && value.planPath.trim() ? value.planPath.trim() : undefined
  return {
    sessionId,
    objective: objective.length > SESSION_GOAL_OBJECTIVE_LIMIT ? objective.slice(0, SESSION_GOAL_OBJECTIVE_LIMIT) : objective,
    status: status as SessionGoalStatus,
    tokensUsed: nonNegativeNumber(value.tokensUsed) ?? 0,
    timeUsedSeconds: nonNegativeNumber(value.timeUsedSeconds) ?? 0,
    ...(tokenBudget !== undefined ? { tokenBudget } : {}),
    ...(timeBudgetSeconds !== undefined ? { timeBudgetSeconds } : {}),
    ...(remainingTokens !== undefined ? { remainingTokens } : {}),
    ...(remainingTimeSeconds !== undefined ? { remainingTimeSeconds } : {}),
    ...(planPath ? { planPath } : {}),
    createdAt,
    ...(updatedAt !== undefined ? { updatedAt } : {}),
  }
}

/** A goal that cannot progress without a person: the runtime reports it blocked or out of budget. */
export function goalNeedsPerson(goal: Pick<SessionGoalSnapshot, "status"> | null | undefined): boolean {
  return goal?.status === "blocked" || goal?.status === "budget_limited"
}

/** Orders two snapshots of one goal; a snapshot without an update time is as old as its creation. */
export function goalRevision(goal: Pick<SessionGoalSnapshot, "createdAt" | "updatedAt">): number {
  return goal.updatedAt ?? goal.createdAt
}
