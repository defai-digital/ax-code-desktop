import React from "react"

import { readMultiRunIdentity } from "@/lib/multirun/identity"
import { parseMultiRunSessionTitle } from "@/lib/multirun/title"
import { multiRunGroupKeyForRow } from "@/lib/supervision/multiRunGroups"
import { useAllLiveSessions } from "@/sync/sync-context"

/**
 * Compare-view key for a live session, or null when the session is missing, not a multi-run
 * lane, or a fusion session. Other surfaces use this to offer a Compare entry.
 */
export function useMultiRunGroupKeyForSession(sessionId: string | null | undefined): string | null {
  const sessions = useAllLiveSessions()
  return React.useMemo(() => {
    if (!sessionId) return null
    const session = sessions.find((candidate) => candidate.id === sessionId)
    if (!session) return null
    return multiRunGroupKeyForRow(
      { title: session.title, multiRun: readMultiRunIdentity(session) },
      parseMultiRunSessionTitle,
    )
  }, [sessionId, sessions])
}
