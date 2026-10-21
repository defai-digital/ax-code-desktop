/**
 * Per-session verification from `GET /session/{sessionID}/risk?envelopes=true`
 * (`SessionRiskDetail.envelopes`). Each envelope is a validated verification run.
 * Counts come from `result.passed` and `result.status` only. Prose in `result.output`,
 * review summaries, and workflow pass rates are not reads.
 */

export const VERIFICATION_EVIDENCE_STATES = ["passed", "failed", "pending", "none"] as const

export type VerificationEvidenceState = (typeof VERIFICATION_EVIDENCE_STATES)[number]

export interface VerificationEvidence {
  state: VerificationEvidenceState
  passed: number
  failed: number
  total: number
  updatedAt?: number
  /** Set when the latest read failed and this is an older result; it is not shown or filtered as current. */
  stale?: boolean
}

const WORKFLOWS = new Set(["review", "debug", "qa"])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/**
 * A check that did not pass. `failed`, `timeout` and `error` are the runtime's
 * unsuccessful statuses, and only when `result.passed` is false.
 */
function verificationStatusFailed(status: string): boolean {
  return status === "failed" || status === "timeout" || status === "error"
}

function verificationStatusPending(status: string): boolean {
  return status === "skipped" || status === "unavailable"
}

function classifyResult(passed: boolean, status: string): "passed" | "failed" | "pending" | null {
  if (status === "passed" && passed === true) return "passed"
  if (verificationStatusFailed(status) && passed === false) return "failed"
  if (verificationStatusPending(status) && passed === false) return "pending"
  return null
}

function envelopeUpdatedAt(envelope: Record<string, unknown>): number | null | undefined {
  if (envelope.execution === undefined) return undefined
  if (!isRecord(envelope.execution)) return null
  if (envelope.execution.endedAt === undefined) return undefined
  if (typeof envelope.execution.endedAt !== "string") return null
  const parsed = Date.parse(envelope.execution.endedAt)
  return Number.isFinite(parsed) ? parsed : undefined
}

/**
 * Normalize one risk payload. Returns null when `envelopes` is missing or any
 * envelope is not the pinned schema, so a newer payload is not shown as counts.
 * An empty `envelopes` array is a recorded absence (`state: "none"`).
 */
export function normalizeVerificationEvidence(payload: unknown): VerificationEvidence | null {
  if (!isRecord(payload) || !Array.isArray(payload.envelopes)) return null
  let passed = 0
  let failed = 0
  let pending = 0
  let updatedAt: number | undefined
  for (const envelope of payload.envelopes) {
    if (!isRecord(envelope)) return null
    if (envelope.schemaVersion !== 1) return null
    if (typeof envelope.workflow !== "string" || !WORKFLOWS.has(envelope.workflow)) return null
    if (!isRecord(envelope.result) || typeof envelope.result.passed !== "boolean") return null
    if (typeof envelope.result.status !== "string") return null
    const outcome = classifyResult(envelope.result.passed, envelope.result.status)
    if (!outcome) return null
    if (outcome === "passed") passed += 1
    else if (outcome === "failed") failed += 1
    else pending += 1
    const endedAt = envelopeUpdatedAt(envelope)
    if (endedAt === null) return null
    if (endedAt !== undefined) updatedAt = updatedAt === undefined ? endedAt : Math.max(updatedAt, endedAt)
  }
  const total = payload.envelopes.length
  const state: VerificationEvidenceState =
    total === 0 ? "none" : failed > 0 ? "failed" : pending > 0 ? "pending" : "passed"
  return { state, passed, failed, total, ...(updatedAt !== undefined ? { updatedAt } : {}) }
}
