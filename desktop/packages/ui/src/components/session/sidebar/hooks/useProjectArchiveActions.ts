import React from "react"
import type { Session } from "@defai-digital/ax-code-sdk/v2"
import type { ProjectItem } from "../types"

type ProjectArchiveConfirmation = { projectName: string; sessions: Session[] } | null

type Args = {
  projects: ProjectItem[]
  getSessionsForProject: (project: { normalizedPath: string }) => Session[]
  inventoryReady: boolean
  isProjectReady: (id: string) => boolean
  showConfirmation: boolean
  archiveSessions: (sessions: Session[]) => void
}

export function useProjectArchiveActions({
  projects,
  getSessionsForProject,
  inventoryReady,
  isProjectReady,
  showConfirmation,
  archiveSessions,
}: Args) {
  const [confirmation, setConfirmation] = React.useState<ProjectArchiveConfirmation>(null)
  const targetsForProject = React.useCallback(
    (id: string) => {
      const project = projects.find((candidate) => candidate.id === id)
      if (!inventoryReady || !project || !isProjectReady(id)) return null
      // Use the complete ownership list, not search results, visible groups or
      // multi-selection. It includes worktrees, hidden rows and subagents.
      const sessions = getSessionsForProject(project).filter((session) => !session.time?.archived)
      if (sessions.length === 0) return null
      const label = project.label?.trim()
      return {
        projectName: label ? `${label} (${project.normalizedPath})` : project.normalizedPath,
        sessions,
      }
    },
    [getSessionsForProject, inventoryReady, isProjectReady, projects],
  )

  const canArchiveProject = React.useCallback((id: string) => Boolean(targetsForProject(id)), [targetsForProject])
  const archiveProject = React.useCallback(
    (id: string) => {
      const target = targetsForProject(id)
      if (!target) return
      if (showConfirmation) setConfirmation(target)
      else archiveSessions(target.sessions)
    },
    [archiveSessions, showConfirmation, targetsForProject],
  )

  const confirmArchiveProject = React.useCallback(() => {
    if (!confirmation) return
    // Keep the confirmed membership and count stable across project switches
    // and incoming sessions while the dialog is open.
    setConfirmation(null)
    archiveSessions(confirmation.sessions)
  }, [archiveSessions, confirmation])

  return { confirmation, setConfirmation, canArchiveProject, archiveProject, confirmArchiveProject }
}
