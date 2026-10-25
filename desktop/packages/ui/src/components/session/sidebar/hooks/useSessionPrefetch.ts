import React from "react"
import type { Session } from "@defai-digital/ax-code-sdk/v2"
import { normalizeProjectPath } from "@/lib/projectResolution"
import { resolveGlobalSessionDirectory } from "@/stores/useGlobalSessionsStore"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { getSyncSessionMaterializationStatus } from "@/sync/sync-refs"

const SESSION_PREFETCH_HOVER_DELAY_MS = 180
const SESSION_PREFETCH_SETTLE_MS = 600
const SESSION_PREFETCH_CONCURRENCY = 1
const SESSION_PREFETCH_PENDING_LIMIT = 6

/** Only sessions in the directory on screen can be prefetched through its sync store. */
export const isSessionInPrefetchDirectory = (session: Session, directory: string | null): boolean => {
  const activeDirectory = normalizeProjectPath(directory)
  return !!activeDirectory && resolveGlobalSessionDirectory(session) === activeDirectory
}

type Args = {
  currentSessionId: string | null
  sortedSessions: Session[]
  recentSessionIds?: string[]
  directory: string | null
  ensureSessionRenderable: (sessionId: string) => Promise<unknown>
}

export const useSessionPrefetch = ({
  currentSessionId,
  sortedSessions,
  recentSessionIds = [],
  directory,
  ensureSessionRenderable,
}: Args): void => {
  const sessionPrefetchTimersRef = React.useRef<Map<string, number>>(new Map())
  const sessionPrefetchQueueRef = React.useRef<string[]>([])
  const sessionPrefetchInFlightRef = React.useRef<Set<string>>(new Set())

  // The sidebar lists every project's live sessions, but sync only holds the
  // active directory's child store. Prefetching a neighbor from another project
  // through this directory asks the runtime for a foreign transcript and gets a
  // 409/404; only neighbors in the directory on screen are renderable here.
  const sessionById = React.useMemo(
    () => new Map(sortedSessions.map((session) => [session.id, session])),
    [sortedSessions],
  )
  const isInActiveDirectory = React.useCallback(
    (sessionId: string) => {
      const session = sessionById.get(sessionId)
      return session ? isSessionInPrefetchDirectory(session, directory) : false
    },
    [directory, sessionById],
  )
  const contextRef = React.useRef({ isInActiveDirectory, ensureSessionRenderable })
  React.useLayoutEffect(() => {
    contextRef.current = { isInActiveDirectory, ensureSessionRenderable }
  }, [isInActiveDirectory, ensureSessionRenderable])

  const pumpSessionPrefetchQueue = React.useCallback(() => {
    if (typeof window === "undefined") {
      return
    }

    while (
      sessionPrefetchInFlightRef.current.size < SESSION_PREFETCH_CONCURRENCY &&
      sessionPrefetchQueueRef.current.length > 0
    ) {
      const nextSessionId = sessionPrefetchQueueRef.current.shift()
      if (!nextSessionId) {
        break
      }

      const state = useSessionUIStore.getState()
      if (state.currentSessionId === nextSessionId) {
        continue
      }
      if (!contextRef.current.isInActiveDirectory(nextSessionId)) {
        continue
      }

      // Check if the session is already renderable in the sync child store.
      if (getSyncSessionMaterializationStatus(nextSessionId).renderable) {
        continue
      }

      sessionPrefetchInFlightRef.current.add(nextSessionId)
      void contextRef.current.ensureSessionRenderable(nextSessionId)
        .catch(() => undefined)
        .finally(() => {
          sessionPrefetchInFlightRef.current.delete(nextSessionId)
          pumpSessionPrefetchQueue()
        })
    }
  }, [])

  const scheduleSessionPrefetch = React.useCallback(
    (sessionId: string | null | undefined) => {
      if (!sessionId || sessionId === currentSessionId || typeof window === "undefined") {
        return
      }
      if (!isInActiveDirectory(sessionId)) {
        return
      }

      // Already renderable in sync
      if (getSyncSessionMaterializationStatus(sessionId).renderable) {
        return
      }

      if (sessionPrefetchInFlightRef.current.has(sessionId)) {
        return
      }

      if (sessionPrefetchQueueRef.current.includes(sessionId)) {
        return
      }

      if (sessionPrefetchQueueRef.current.length >= SESSION_PREFETCH_PENDING_LIMIT) {
        sessionPrefetchQueueRef.current.shift()
      }

      const existingTimer = sessionPrefetchTimersRef.current.get(sessionId)
      if (existingTimer !== undefined) {
        window.clearTimeout(existingTimer)
      }

      const timer = window.setTimeout(() => {
        sessionPrefetchTimersRef.current.delete(sessionId)
        sessionPrefetchQueueRef.current.push(sessionId)
        pumpSessionPrefetchQueue()
      }, SESSION_PREFETCH_HOVER_DELAY_MS)
      sessionPrefetchTimersRef.current.set(sessionId, timer)
    },
    [currentSessionId, isInActiveDirectory, pumpSessionPrefetchQueue],
  )

  // Wait for the active session to finish loading before prefetching neighbors.
  // On rapid session switches the timer resets, so only the final session triggers prefetch.
  React.useEffect(() => {
    if (!currentSessionId || sortedSessions.length === 0) {
      return
    }
    const timer = window.setTimeout(() => {
      const currentIndex = sortedSessions.findIndex((session) => session.id === currentSessionId)
      if (currentIndex < 0) return
      scheduleSessionPrefetch(sortedSessions[currentIndex - 1]?.id)
      scheduleSessionPrefetch(sortedSessions[currentIndex + 1]?.id)
    }, SESSION_PREFETCH_SETTLE_MS)
    return () => window.clearTimeout(timer)
  }, [currentSessionId, scheduleSessionPrefetch, sortedSessions])

  React.useEffect(() => {
    if (!currentSessionId || recentSessionIds.length === 0) {
      return
    }
    const timer = window.setTimeout(() => {
      const currentIndex = recentSessionIds.indexOf(currentSessionId)
      if (currentIndex < 0) return
      scheduleSessionPrefetch(recentSessionIds[currentIndex - 1])
      scheduleSessionPrefetch(recentSessionIds[currentIndex + 1])
    }, SESSION_PREFETCH_SETTLE_MS)
    return () => window.clearTimeout(timer)
  }, [currentSessionId, recentSessionIds, scheduleSessionPrefetch])

  React.useEffect(() => {
    const prefetchTimers = sessionPrefetchTimersRef.current
    return () => {
      prefetchTimers.forEach((timer) => {
        clearTimeout(timer)
      })
      prefetchTimers.clear()
      sessionPrefetchQueueRef.current = []
    }
  }, [directory])
}
