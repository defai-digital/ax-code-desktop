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
import {
  useAllLiveSessions,
  usePendingPermissionSessionIds,
  usePendingQuestionSessionIds,
} from "@/sync/sync-context"

/** Badge facts for the home queue and switcher ordering. Project tone stays separate. */
export function useNeedsYouSessionInputs(): NeedsYouSessionInput[] {
  const sessions = useAllLiveSessions()
  const projects = useProjectsStore((state) => state.projects)
  const pendingPermissions = usePendingPermissionSessionIds()
  const pendingQuestions = usePendingQuestionSessionIds()
  const unseenHasError = useSyncNotificationStore((state) => state.index.session.unseenHasError)
  const runEndedAt = useRunStateStore((state) => state.runEndedAt)
  const gitDirectories = useGitStore((state) => state.directories)
  const worktreeMetadata = useSessionUIStore((state) => state.worktreeMetadata)

  return React.useMemo(() => {
    const inputs: NeedsYouSessionInput[] = []
    for (const session of sessions) {
      if (session.time?.archived) continue
      const directory = resolveGlobalSessionDirectory(session)
      const projectDirectory = worktreeMetadata.get(session.id)?.projectDirectory ?? null
      const gitStatus = directory ? gitDirectories.get(directory)?.status : null
      const finishedWithUncommitted = runEndedAt[session.id] != null && gitStatus != null && gitStatus.isClean === false
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
        updatedAt: session.time?.updated ?? session.time?.created ?? 0,
        directory,
        title: session.title,
      })
    }
    return inputs
  }, [
    gitDirectories,
    pendingPermissions,
    pendingQuestions,
    projects,
    runEndedAt,
    sessions,
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
