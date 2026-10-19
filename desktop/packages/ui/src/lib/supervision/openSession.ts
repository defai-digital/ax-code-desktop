import { useProjectsStore } from "@/stores/useProjectsStore"
import { useSupervisionStore } from "@/stores/useSupervisionStore"
import { useUIStore } from "@/stores/useUIStore"
import { useSessionUIStore } from "@/sync/session-ui-store"

export interface OpenSessionTarget {
  sessionId: string
  projectId?: string | null
  directory?: string | null
}

/**
 * The one way supervision surfaces open a session: select its project, show the chat, select the session,
 * leave Mission Control and record the visit for the return stack.
 */
export function openSupervisedSession(target: OpenSessionTarget): void {
  if (!target.sessionId) return
  if (target.projectId) useProjectsStore.getState().setActiveProject(target.projectId)
  useUIStore.getState().setActiveMainTab("chat")
  useSessionUIStore.getState().setCurrentSession(target.sessionId, target.directory ?? null)
  const supervision = useSupervisionStore.getState()
  supervision.setCompareRunGroupKey(null)
  supervision.setMissionControlOpen(false)
  supervision.setNeedsYouPopoverOpen(false)
  supervision.recordSessionVisit(target.sessionId)
}
