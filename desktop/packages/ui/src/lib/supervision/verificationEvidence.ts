/**
 * Per-session verification from `GET /session/{sessionID}/risk?envelopes=true`
 * (`SessionRiskDetail.envelopes`). Each envelope is a validated verification run.
 * Counts come from `result.passed` and `result.status` only. Prose in `result.output`,
 * review summaries, and workflow pass rates are not reads.
 */

export type VerificationEvidenceState = "passed" | "failed" | "pending" | "none"

/**
 * The commit the checks ran on, as each envelope's `sourceState` reports it. The runtime's `dirtyDigest` is a
 * fingerprint of the file contents, present for clean and edited trees alike, so it cannot say whether the tree had
 * uncommitted changes and is not read here.
 */
export interface VerificationSource {
  commit: string
}

export interface VerificationEvidence {
  state: VerificationEvidenceState
  passed: number
  failed: number
  total: number
  updatedAt?: number
  /** Set when the latest read failed and this is an older result; it is not shown or filtered as current. */
  stale?: boolean
  /**
   * The one commit every check ran on, or `"mixed"` when the envelopes name different commits. Otherwise omitted
   * when any envelope does not say which commit it ran on, so a partly unattributed result is never presented as
   * bound to a commit.
   */
  source?: VerificationSource | "mixed"
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
 * The commit an envelope ran on, or undefined when it does not attribute one. Attribution is optional provenance:
 * a `sourceState` Desktop cannot read leaves the result unattributed and never hides the counts.
 */
function envelopeCommit(envelope: Record<string, unknown>): string | undefined {
  const source = envelope.sourceState
  if (!isRecord(source) || source.available !== true) return undefined
  return typeof source.commit === "string" && source.commit ? source.commit : undefined
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
  let commit: string | "mixed" | undefined
  let unattributed = false
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
    const ranOn = envelopeCommit(envelope)
    if (ranOn === undefined) unattributed = true
    else if (commit === undefined) commit = ranOn
    else if (commit !== ranOn) commit = "mixed"
  }
  const total = payload.envelopes.length
  const state: VerificationEvidenceState =
    total === 0 ? "none" : failed > 0 ? "failed" : pending > 0 ? "pending" : "passed"
  const boundSource: VerificationEvidence["source"] =
    commit === "mixed" ? "mixed" : unattributed || commit === undefined ? undefined : { commit }
  return {
    state,
    passed,
    failed,
    total,
    ...(updatedAt !== undefined ? { updatedAt } : {}),
    ...(boundSource !== undefined ? { source: boundSource } : {}),
  }
}
