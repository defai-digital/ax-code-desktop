import type { ChildSessionSummary } from "./childSessions"
import type { MultiRunIdentity } from "@/lib/multirun/identity"
import type { ActivityPreview } from "./activityPreview"
import type { SessionGoalSnapshot } from "./goal"
import type { SupervisionEvidence, SupervisionState } from "./sessionState"
import type { VerificationEvidence } from "./verificationEvidence"

export interface SupervisionRow {
  sessionId: string
  title: string
  state: SupervisionState
  /** This root session and its loaded subagent sessions, for finding their pending requests. */
  treeSessionIds: string[]
  /** Loaded descendants with their own state, for the board details disclosure. */
  childSessions?: ChildSessionSummary[]
  projectId: string | null
  projectLabel: string | null
  directory: string | null
  updatedAt: number
  evidence: SupervisionEvidence | null
  /** The root session's runtime goal, or null when it has none. Child goals never stand in for it. */
  goal: SessionGoalSnapshot | null
  /**
   * Verification envelopes for this root session. Null when the risk payload is not loaded
   * or is not the pinned envelope list. Omitted on rows built before checks existed.
   */
  checks?: VerificationEvidence | null
  /**
   * In-progress todo, or the latest loaded assistant text. Null when that session's
   * todo and parts are not loaded. Omitted on rows built before activity existed.
   */
  activity?: ActivityPreview | null
  errorMessage?: string
  /** Validated `metadata.multiRun` of the session; absent for sessions without it. */
  multiRun?: MultiRunIdentity
}
