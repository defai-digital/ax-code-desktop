import React from "react"
import type { Session } from "@defai-digital/ax-code-sdk/v2"
import { axCodeClient } from "@/lib/ax-code/client"
import { archiveGlobalSession, GlobalSessionArchiveUnavailableError } from "@/lib/ax-code/sessionArchiveApi"
import { formatSdkError } from "@/lib/ax-code/sdkError"
import {
  ensureGlobalSessionsLoaded,
  useGlobalSessionsStore,
  resolveGlobalSessionDirectory,
} from "@/stores/useGlobalSessionsStore"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { getAllSyncSessions } from "@/sync/sync-refs"
import { useUIStore } from "@/stores/useUIStore"

const DAY_MS = 24 * 60 * 60 * 1000
const AUTO_DELETE_KEEP_RECENT = 5
const AUTO_DELETE_INTERVAL_MS = 24 * 60 * 60 * 1000

const getSessionLastActivity = (session: Session): number => {
  return session.time?.updated ?? session.time?.created ?? 0
}

type BuildAutoDeleteCandidatesOptions = {
  sessions: Session[]
  archivedSessions?: Session[]
  currentSessionId: string | null
  cutoffDays: number
  keepRecent?: number
  now?: number
}

/**
 * Deleting a session cascades to its descendants on the runtime, so cleaning up
 * a session also removes every child below it. Returns the ancestors of the
 * given sessions so a session with a descendant that must be kept is kept too.
 */
const collectAncestorIds = (sessions: Session[], keptIds: Iterable<string>): Set<string> => {
  const parentOf = new Map<string, string | undefined>()
  for (const session of sessions) {
    if (session?.id) parentOf.set(session.id, session.parentID)
  }
  const ancestors = new Set<string>()
  for (const id of keptIds) {
    let parent = parentOf.get(id)
    while (parent && !ancestors.has(parent)) {
      ancestors.add(parent)
      parent = parentOf.get(parent)
    }
  }
  return ancestors
}

export const buildAutoDeleteCandidates = ({
  sessions,
  archivedSessions = [],
  currentSessionId,
  cutoffDays,
  keepRecent = AUTO_DELETE_KEEP_RECENT,
  now = Date.now(),
}: BuildAutoDeleteCandidatesOptions): string[] => {
  if (!Array.isArray(sessions) || cutoffDays <= 0) {
    return []
  }

  const cutoffTime = now - cutoffDays * DAY_MS
  const sorted = [...sessions].sort((a, b) => getSessionLastActivity(b) - getSessionLastActivity(a))
  const protectedIds = new Set(sorted.slice(0, keepRecent).map((session) => session.id))

  const isExpired = (session: Session): boolean => {
    if (!session?.id) return false
    if (protectedIds.has(session.id)) return false
    if (session.id === currentSessionId) return false
    if (session.share) return false
    const lastActivity = getSessionLastActivity(session)
    if (!lastActivity) return false
    return lastActivity < cutoffTime
  }
  const keptIds = sorted.filter((session) => session?.id && !isExpired(session)).map((session) => session.id)
  if (currentSessionId) keptIds.push(currentSessionId)
  // Archived sessions are outside retention, but deleting an active ancestor still cascades to them.
  keptIds.push(...archivedSessions.map((session) => session.id))
  const keptAncestorIds = collectAncestorIds([...sorted, ...archivedSessions], keptIds)

  return sorted.filter((session) => isExpired(session) && !keptAncestorIds.has(session.id)).map((session) => session.id)
}

type CleanupResult = {
  completedIds: string[]
  failedIds: string[]
  action: "archive" | "delete"
  failureReason?: string
  skippedReason?: "disabled" | "loading" | "cooldown" | "no-candidates" | "running"
}

type CleanupOptions = {
  autoRun?: boolean
  enabled?: boolean
}

type ScopedSdkClient = ReturnType<typeof axCodeClient.getScopedSdkClient>

/**
 * Applies one retention action through the session's scoped client. Returns
 * false when the runtime rejected it: the generated SDK resolves with `{ error }`
 * instead of throwing, so a rejected cleanup used to be reported as completed —
 * which both hid the failure and recorded a "last run" that deferred the next
 * attempt by a day.
 */
export const applySessionRetentionAction = async (
  scopedSdk: ScopedSdkClient,
  id: string,
  directory: string,
  action: "archive" | "delete",
): Promise<boolean> => {
  const result =
    action === "archive"
      ? await scopedSdk.session.update({ sessionID: id, directory, time: { archived: Date.now() } })
      : await scopedSdk.session.delete({ sessionID: id, directory })
  // A 404 means the session is already gone: deleting an expired parent cascades
  // to its children, which are usually candidates in the same run.
  return !result?.error || result.response?.status === 404
}

// The cleanup run that is in flight, shared by every instance of the hook (see runCleanup). It is
// cleared by the run itself, so a call that arrives later starts a fresh one.
let sessionCleanupInFlight: Promise<CleanupResult> | null = null

export const useSessionAutoCleanup = (enabledOrOptions?: boolean | CleanupOptions) => {
  const options = typeof enabledOrOptions === "object" ? enabledOrOptions : undefined
  const autoRun = options?.autoRun !== false
  const enabled = typeof enabledOrOptions === "boolean" ? enabledOrOptions : (options?.enabled ?? true)

  const currentSessionId = useSessionUIStore((state) => state.currentSessionId)
  const isLoading = useSessionUIStore((state) => state.isLoading)
  const globalSessions = useGlobalSessionsStore((state) => state.activeSessions)
  const archivedSessions = useGlobalSessionsStore((state) => state.archivedSessions)
  const hasLoadedGlobalSessions = useGlobalSessionsStore((state) => state.hasLoaded)

  const autoDeleteEnabled = useUIStore((state) => state.autoDeleteEnabled)
  const autoDeleteAfterDays = useUIStore((state) => state.autoDeleteAfterDays)
  const sessionRetentionAction = useUIStore((state) => state.sessionRetentionAction)
  const autoDeleteLastRunAt = useUIStore((state) => state.autoDeleteLastRunAt)
  const setAutoDeleteLastRunAt = useUIStore((state) => state.setAutoDeleteLastRunAt)

  const [isRunning, setIsRunning] = React.useState(false)

  React.useEffect(() => {
    void ensureGlobalSessionsLoaded(getAllSyncSessions())
  }, [])

  const candidates = React.useMemo(() => {
    if (autoDeleteAfterDays <= 0) {
      return []
    }
    return buildAutoDeleteCandidates({
      sessions: globalSessions,
      archivedSessions,
      currentSessionId,
      cutoffDays: autoDeleteAfterDays,
    })
  }, [autoDeleteAfterDays, currentSessionId, globalSessions, archivedSessions])

  const runCleanup = React.useCallback(
    async ({ force = false }: { force?: boolean } = {}): Promise<CleanupResult> => {
      // One cleanup at a time across every mounted instance of this hook. It is mounted twice — the
      // app-wide housekeeping run in AppEffects and the settings page's manual run — and a
      // per-instance ref only serialised calls on one of them: the two runs built the same candidate
      // list and deleted each session twice, and the manual run reported the sessions it had just
      // deleted as failures. A call that arrives while one run is in flight joins it and reports that
      // run's outcome, which is what a manual click wants anyway.
      if (sessionCleanupInFlight) {
        setIsRunning(true)
        try {
          return await sessionCleanupInFlight
        } finally {
          setIsRunning(false)
        }
      }

      setIsRunning(true)

      const run = (async (): Promise<CleanupResult> => {
        try {
          if (!autoDeleteEnabled || autoDeleteAfterDays <= 0) {
            if (!force) {
              return { completedIds: [], failedIds: [], action: sessionRetentionAction, skippedReason: "disabled" }
            }
          }

          if (isLoading) {
            return { completedIds: [], failedIds: [], action: sessionRetentionAction, skippedReason: "loading" }
          }

          const now = Date.now()
          if (!force && autoDeleteLastRunAt && now - autoDeleteLastRunAt < AUTO_DELETE_INTERVAL_MS) {
            return { completedIds: [], failedIds: [], action: sessionRetentionAction, skippedReason: "cooldown" }
          }

          const { activeSessions: sessions, archivedSessions: archived = [] } = await ensureGlobalSessionsLoaded(getAllSyncSessions())

          if (sessions.length === 0) {
            return { completedIds: [], failedIds: [], action: sessionRetentionAction, skippedReason: "no-candidates" }
          }

          const candidateIds = buildAutoDeleteCandidates({
            sessions,
            archivedSessions: archived,
            currentSessionId: useSessionUIStore.getState().currentSessionId,
            cutoffDays: autoDeleteAfterDays,
            now,
          })

          if (candidateIds.length === 0) {
            setAutoDeleteLastRunAt(now)
            return { completedIds: [], failedIds: [], action: sessionRetentionAction, skippedReason: "no-candidates" }
          }

          const sessionMap = new Map(sessions.map((session) => [session.id, session]))
          const completedIds: string[] = []
          const failedIds: string[] = []
          let failureReason: string | undefined
          let globalArchiveAvailable = true
          let archiveUpgradeReason: string | undefined

          for (const id of candidateIds) {
            // Selection can change while loading or awaiting a prior action.
            // Deleting a session also deletes its descendants, so skip the open session's ancestors too.
            const openSessionId = useSessionUIStore.getState().currentSessionId
            if (id === openSessionId) continue
            if (openSessionId && collectAncestorIds([...sessions, ...archived], [openSessionId]).has(id)) continue
            if (sessionRetentionAction === "archive" && globalArchiveAvailable) {
              try {
                await archiveGlobalSession(id, Date.now())
                completedIds.push(id)
                continue
              } catch (error) {
                if (error instanceof GlobalSessionArchiveUnavailableError) {
                  // Older signed runtimes can still archive sessions in valid projects.
                  // Probe once per run, then retain their existing scoped behavior.
                  globalArchiveAvailable = false
                  archiveUpgradeReason = error.message
                } else {
                  failedIds.push(id)
                  failureReason ??= formatSdkError(error)
                  continue
                }
              }
            }
            const session = sessionMap.get(id)
            const directory = session ? resolveGlobalSessionDirectory(session) : null
            if (!directory) {
              failedIds.push(id)
              failureReason ??= archiveUpgradeReason
              continue
            }

            const scopedSdk = axCodeClient.getScopedSdkClient(directory)

            try {
              const completed = await applySessionRetentionAction(scopedSdk, id, directory, sessionRetentionAction)
              if (completed) {
                completedIds.push(id)
              } else {
                failedIds.push(id)
                failureReason ??= archiveUpgradeReason
              }
            } catch (error) {
              failedIds.push(id)
              failureReason ??= archiveUpgradeReason ?? formatSdkError(error)
            }
          }

          // No manual global-store writes (S4.5): each successful SDK call above
          // emits session.updated(time.archived) / session.deleted, and the
          // event stream is the sole writer of record for the global index.
          // (The delete event also funnels through removeSessions, so the
          // per-session client-state cleanup there still runs.)
          // Failed work must remain eligible for the next non-forced retry.
          if (failedIds.length === 0) setAutoDeleteLastRunAt(Date.now())
          return {
            completedIds,
            failedIds,
            action: sessionRetentionAction,
            ...(failureReason ? { failureReason } : {}),
          }
        } finally {
          setIsRunning(false)
        }
      })()

      sessionCleanupInFlight = run
      // Cleared from here, not from the run itself: the skip reasons return before the first
      // await, and an async function that returns before awaiting finishes synchronously —
      // including its `finally`, which would then clear the latch *before* the assignment
      // below put the settled promise in it. Every later call joined that promise and replayed
      // its stale result, so retention never ran again for the life of the window.
      const release = () => {
        if (sessionCleanupInFlight === run) {
          sessionCleanupInFlight = null
        }
      }
      void run.then(release, release)
      return run
    },
    [
      autoDeleteAfterDays,
      autoDeleteEnabled,
      autoDeleteLastRunAt,
      isLoading,
      sessionRetentionAction,
      setAutoDeleteLastRunAt,
    ],
  )

  React.useEffect(() => {
    if (!enabled) {
      return
    }

    if (!autoRun) {
      return
    }
    if (!autoDeleteEnabled || autoDeleteAfterDays <= 0) {
      return
    }
    if (isLoading || !hasLoadedGlobalSessions || globalSessions.length === 0) {
      return
    }
    const now = Date.now()
    if (autoDeleteLastRunAt && now - autoDeleteLastRunAt < AUTO_DELETE_INTERVAL_MS) {
      return
    }
    void runCleanup()
  }, [
    autoDeleteAfterDays,
    autoDeleteEnabled,
    autoDeleteLastRunAt,
    autoRun,
    enabled,
    hasLoadedGlobalSessions,
    globalSessions.length,
    isLoading,
    runCleanup,
  ])

  return {
    candidates,
    isRunning,
    runCleanup,
    keepRecentCount: AUTO_DELETE_KEEP_RECENT,
    action: sessionRetentionAction,
  }
}
