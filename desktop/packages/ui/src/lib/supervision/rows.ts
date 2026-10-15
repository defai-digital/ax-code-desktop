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
}
