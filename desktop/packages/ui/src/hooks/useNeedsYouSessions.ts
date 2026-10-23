import React from "react"

import { RuntimeAPIContext } from "@/contexts/runtimeAPIContext"
import type { NeedsYouSessionInput } from "@/lib/needsYou"
import { resolveSessionProjectId } from "@/lib/projectStatus"
import { useGitStore } from "@/stores/useGitStore"
import { resolveGlobalSessionDirectory } from "@/stores/useGlobalSessionsStore"
import { useProjectsStore } from "@/stores/useProjectsStore"
import { useSyncNotificationStore } from "@/sync/notification-store"
import { useRunStateStore } from "@/sync/run-state-store"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { goalNeedsPerson } from "@/lib/supervision/goal"
import { resolveSupervisionEvidence, type SessionSummaryLike } from "@/lib/supervision/sessionState"
import { useSessionGoalStore } from "@/stores/useSessionGoalStore"
import {
  useAllLiveSessions,
  useAllSessionStatuses,
  usePendingPermissionSessionIds,
  usePendingQuestionSessionIds,
} from "@/sync/sync-context"

/** Badge facts for the home queue and switcher ordering. Project tone stays separate. */
export function useNeedsYouSessionInputs(): NeedsYouSessionInput[] {
  const sessions = useAllLiveSessions()
  const statuses = useAllSessionStatuses()
  const projects = useProjectsStore((state) => state.projects)
  const pendingPermissions = usePendingPermissionSessionIds()
  const pendingQuestions = usePendingQuestionSessionIds()
  const unseenHasError = useSyncNotificationStore((state) => state.index.session.unseenHasError)
  const runEndedAt = useRunStateStore((state) => state.runEndedAt)
  const nudgeDismissedAt = useRunStateStore((state) => state.nudgeDismissedAt)
  const gitDirectories = useGitStore((state) => state.directories)
  const worktreeMetadata = useSessionUIStore((state) => state.worktreeMetadata)
  const goals = useSessionGoalStore((state) => state.goals)

  return React.useMemo(() => {
    const inputs: NeedsYouSessionInput[] = []
    const loadedIds = new Set<string>()
    for (const session of sessions) {
      if (!session.time?.archived) loadedIds.add(session.id)
    }
    for (const session of sessions) {
      if (session.time?.archived) continue
      const directory = resolveGlobalSessionDirectory(session)
      const projectDirectory = worktreeMetadata.get(session.id)?.projectDirectory ?? null
      const gitStatus = directory ? gitDirectories.get(directory)?.status : null
      // Finished work is only worth a look when this session reported changes of its own: a directory that is dirty
      // for another reason (the user's edits, a sibling session) says nothing about this run. A dismissal holds
      // until the next run ends, the same rule the in-session "done, not committed" nudge follows.
      const endedAt = runEndedAt[session.id] ?? null
      const dismissedAt = nudgeDismissedAt[session.id] ?? null
      const hasOwnChanges = resolveSupervisionEvidence(session.summary as SessionSummaryLike | undefined) !== null
      const finishedWithUncommitted =
        endedAt !== null &&
        (dismissedAt === null || dismissedAt < endedAt) &&
        hasOwnChanges &&
        gitStatus != null &&
        gitStatus.isClean === false
      const goal = goals[session.id] ?? null
      const statusType = statuses[session.id]?.type ?? null
      const running = statusType === "busy" || statusType === "retry"
      const parentId = (session as { parentID?: string | null }).parentID ?? null
      const isChild = typeof parentId === "string" && parentId.length > 0 && loadedIds.has(parentId)
      inputs.push({
        id: session.id,
        projectId: resolveSessionProjectId(
          { directory, projectDirectory, archived: false },
          projects,
        ),
        permissionCount: pendingPermissions.has(session.id) ? 1 : 0,
        questionCount: pendingQuestions.has(session.id) ? 1 : 0,
        hasError: unseenHasError[session.id] === true,
        finishedWithUncommitted,
        // Running outranks a blocked goal, and only the root of a tree
        // raises attention for its goal; the goal itself stays on the input.
        goalNeedsPerson: !running && !isChild && goalNeedsPerson(goal),
        goal,
        statusType,
        updatedAt: session.time?.updated ?? session.time?.created ?? 0,
        directory,
        title: session.title,
      })
    }
    return inputs
  }, [
    gitDirectories,
    goals,
    nudgeDismissedAt,
    pendingPermissions,
    pendingQuestions,
    projects,
    runEndedAt,
    sessions,
    statuses,
    unseenHasError,
    worktreeMetadata,
  ])
}

/** Load git status for the home queue so finished-but-dirty sessions can be listed. */
export function useEnsureDirectoriesGitStatus(directories: readonly string[]): void {
  const runtime = React.useContext(RuntimeAPIContext)
  const ensureStatus = useGitStore((state) => state.ensureStatus)
  const directoryKey = directories.join("\n")

  React.useEffect(() => {
    const git = runtime?.git
    if (!git || directoryKey.length === 0) return
    for (const directory of directoryKey.split("\n")) {
      if (directory) void ensureStatus(directory, git)
    }
  }, [directoryKey, ensureStatus, runtime])
}
