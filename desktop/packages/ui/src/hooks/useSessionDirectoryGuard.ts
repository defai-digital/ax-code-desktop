import { useEffect } from "react"
import { axCodeClient } from "@/lib/ax-code/client"
import { getProjectPathIdentityKey, normalizeProjectPath } from "@/lib/projectResolution"
import { useProjectsStore } from "@/stores/useProjectsStore"
import { useSessionUIStore } from "@/sync/session-ui-store"

interface SessionDirectoryGuardOptions {
  directory: string | null
  enabled: boolean
}

export function useSessionDirectoryGuard(props: SessionDirectoryGuardOptions): void {
  const sessionId = useSessionUIStore((state) => state.currentSessionId)
  const worktrees = useSessionUIStore((state) => state.availableWorktreesByProject)
  const projects = useProjectsStore((state) => state.projects)
  useEffect(() => {
    if (!props.enabled) return
    const directory = normalizeProjectPath(props.directory)
    const clientDirectory = getProjectPathIdentityKey(axCodeClient.getDirectory())
    if (!directory || !clientDirectory || clientDirectory !== getProjectPathIdentityKey(directory)) return
    // A registry/worktree refresh can classify a previously unknown session
    // without changing either the selected session or the project count.
    useSessionUIStore.getState().clearCurrentSessionIfOutsideDirectory(directory)
  }, [props.directory, props.enabled, sessionId, worktrees, projects])
}
