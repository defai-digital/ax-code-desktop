import React from "react"

import { formatPathForDisplay } from "@/lib/utils"
import {
  deriveSupervisionState,
  rankSupervisionRows,
  resolveSupervisionEvidence,
  type SessionSummaryLike,
} from "@/lib/supervision/sessionState"
import type { SupervisionRow } from "@/lib/supervision/rows"
import { readMultiRunIdentity } from "@/lib/multirun/identity"
import { useSupervisionStore } from "@/stores/useSupervisionStore"
import { useDirectoryStore } from "@/stores/useDirectoryStore"
import { useProjectsStore } from "@/stores/useProjectsStore"
import { useAllLiveSessions, useAllSessionStatuses } from "@/sync/sync-context"
import { useEnsureDirectoriesGitStatus, useNeedsYouSessionInputs } from "@/hooks/useNeedsYouSessions"
import { rollUpChildStates } from "@/lib/supervision/rollup"
import {
  latestUnseenSessionErrorMessage,
  latestUnseenTreeSessionErrorMessage,
} from "@/lib/supervision/sessionErrorMessage"
import { useSyncNotificationStore } from "@/sync/notification-store"

export type { SupervisionRow } from "@/lib/supervision/rows"

/**
 * One row per non-archived root session across every project, ranked most urgent first. Subagent sessions
 * fold into their root: the root shows the state its tree needs. This is the single read model the titlebar,
 * the sidebar Live section, Mission Control and the peek share; it is computed once by
 * useSupervisionRowsPublisher and read from the supervision store.
 */
export function useSupervisionRows(): SupervisionRow[] {
  return useSupervisionStore((state) => state.rows)
}

/** The row for one session, or null; re-renders only when that row changes. */
export function useSupervisionRow(sessionId: string | null | undefined): SupervisionRow | null {
  return useSupervisionStore((state) =>
    sessionId ? (state.rows.find((row) => row.sessionId === sessionId) ?? null) : null,
  )
}

/** Computes the rows once per app window and publishes them to the supervision store. Mount exactly once. */
export function useSupervisionRowsPublisher(): void {
  const rows = useComputedSupervisionRows()
  React.useEffect(() => {
    useSupervisionStore.getState().setRows(rows)
  }, [rows])
}

function useComputedSupervisionRows(): SupervisionRow[] {
  const inputs = useNeedsYouSessionInputs()
  const sessions = useAllLiveSessions()
  const statuses = useAllSessionStatuses()
  const projects = useProjectsStore((state) => state.projects)
  const homeDirectory = useDirectoryStore((state) => state.homeDirectory)
  const notifications = useSyncNotificationStore((state) => state.list)

  // "Ready to review" comes from git status, so warm it for every session directory.
  const directories = React.useMemo(() => {
    const set = new Set<string>()
    for (const input of inputs) if (input.directory) set.add(input.directory)
    return Array.from(set)
  }, [inputs])
  useEnsureDirectoriesGitStatus(directories)

  return React.useMemo(() => {
    const sessionById = new Map(sessions.map((session) => [session.id, session]))
    const projectById = new Map(projects.map((project) => [project.id, project]))
    const ownStates = inputs.map((input) => ({
      sessionId: input.id,
      parentId: (sessionById.get(input.id) as { parentID?: string | null } | undefined)?.parentID ?? null,
      state: deriveSupervisionState({ ...input, statusType: statuses[input.id]?.type ?? null }),
    }))
    const rootStates = rollUpChildStates(ownStates)
    const rows: SupervisionRow[] = []
    for (const input of inputs) {
      const rolled = rootStates.get(input.id)
      if (!rolled) continue
      const session = sessionById.get(input.id)
      const project = input.projectId ? projectById.get(input.projectId) : undefined
      const path = project?.path ?? input.directory
      const projectLabel = project?.label?.trim() || (path ? formatPathForDisplay(path, homeDirectory) : null)
      const treeSessionIds = rolled.sessionIds
      const errorMessage =
        latestUnseenSessionErrorMessage(notifications, input.id) ??
        latestUnseenTreeSessionErrorMessage(notifications, treeSessionIds)
      const multiRun = readMultiRunIdentity(session)
      rows.push({
        sessionId: input.id,
        title: input.title?.trim() || input.id,
        state: rolled.state,
        treeSessionIds,
        projectId: input.projectId,
        projectLabel,
        directory: input.directory ?? null,
        updatedAt: input.updatedAt ?? 0,
        evidence: resolveSupervisionEvidence(session?.summary as SessionSummaryLike | undefined),
        ...(errorMessage ? { errorMessage } : {}),
        ...(multiRun ? { multiRun } : {}),
      })
    }
    return rankSupervisionRows(rows)
  }, [homeDirectory, inputs, notifications, projects, sessions, statuses])
}
