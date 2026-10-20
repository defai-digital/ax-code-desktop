import type { MultiRunIdentity } from "@/lib/multirun/identity"
import type { SessionGoalSnapshot } from "./goal"
import type { SupervisionEvidence, SupervisionState } from "./sessionState"

export interface SupervisionRow {
  sessionId: string
  title: string
  state: SupervisionState
  /** This root session and its loaded subagent sessions, for finding their pending requests. */
  treeSessionIds: string[]
  projectId: string | null
  projectLabel: string | null
  directory: string | null
  updatedAt: number
  evidence: SupervisionEvidence | null
  /** The root session's runtime goal, or null when it has none. Child goals never stand in for it. */
  goal: SessionGoalSnapshot | null
  errorMessage?: string
  /** Validated `metadata.multiRun` of the session; absent for sessions without it. */
  multiRun?: MultiRunIdentity
}
