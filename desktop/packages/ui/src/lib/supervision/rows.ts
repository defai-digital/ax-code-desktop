import type { MultiRunIdentity } from "@/lib/multirun/identity"
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
  errorMessage?: string
  /** Validated `metadata.multiRun` of the session; absent for sessions without it. */
  multiRun?: MultiRunIdentity
}
