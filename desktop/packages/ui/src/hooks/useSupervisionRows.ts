import React from "react"

import { supervisionProjectLabel } from "@/lib/supervision/projectContext"
import { createCoalescedNotify } from "@/lib/supervision/coalescedNotify"
import {
  activitySliceDeps,
  collectActivityPreviews,
  retainActivityMap,
  type ActivityDirectory,
  type ActivityPreview,
  type ActivityTarget,
} from "@/lib/supervision/activityPreview"
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
import { areSliceDepsEqual } from "@/sync/live-selector-memo"
import { useAllLiveSessions, useAllSessionStatuses, useChildStoreManager } from "@/sync/sync-context"
import { useEnsureDirectoriesGitStatus, useNeedsYouSessionInputs } from "@/hooks/useNeedsYouSessions"
import { verificationEvidenceCache } from "@/hooks/useSupervisionVerification"
import { childSessionSummaries } from "@/lib/supervision/childSessions"
import { rollUpChildStates } from "@/lib/supervision/rollup"
import {
  latestUnseenSessionErrorMessage,
  latestUnseenTreeSessionErrorMessage,
} from "@/lib/supervision/sessionErrorMessage"
import { goalNeedsPerson, goalRevision } from "@/lib/supervision/goal"
import { verificationEvidenceFor } from "@/lib/supervision/verificationEvidenceCache"
import { useSessionGoalStore } from "@/stores/useSessionGoalStore"
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
  const goals = useSessionGoalStore((state) => state.goals)
  const verificationEntries = React.useSyncExternalStore(
    verificationEvidenceCache.subscribe,
    verificationEvidenceCache.getSnapshot,
    verificationEvidenceCache.getSnapshot,
  )
  const activityBySession = useRootActivity(inputs, sessions)

  // "Ready to review" comes from git status, so warm it for every session directory.
  const directories = React.useMemo(() => {
    const set = new Set<string>()
    for (const input of inputs) if (input.directory) set.add(input.directory)
    return Array.from(set)
  }, [inputs])
  useEnsureDirectoriesGitStatus(directories)

  return React.useMemo(() => {
    const sessionById = new Map(sessions.map((session) => [session.id, session]))
    const inputIds = new Set(inputs.map((input) => input.id))
    const ownStates = inputs.map((input) => {
      const parentId = (sessionById.get(input.id) as { parentID?: string | null } | undefined)?.parentID ?? null
      const statusType = statuses[input.id]?.type ?? null
      const running = statusType === "busy" || statusType === "retry"
      const isChild = typeof parentId === "string" && parentId.length > 0 && inputIds.has(parentId)
      return {
        sessionId: input.id,
        parentId,
        state: deriveSupervisionState({
          ...input,
          // Only the root of a tree raises its blocked goal, and never
          // while it is running; child goals stay off the root state.
          goalNeedsPerson: running || isChild ? false : (input.goalNeedsPerson ?? goalNeedsPerson(goals[input.id])),
          statusType,
        }),
      }
    })
    // Details use the child's own goal state without changing the established root rollup.
    const childById = new Map(
      inputs.map((input) => [
        input.id,
        {
          sessionId: input.id,
          title: input.title ?? input.id,
          state: deriveSupervisionState({
            ...input,
            goalNeedsPerson: input.goalNeedsPerson ?? goalNeedsPerson(goals[input.id]),
            statusType: statuses[input.id]?.type ?? null,
          }),
          updatedAt: input.updatedAt ?? 0,
        },
      ]),
    )
    const rootStates = rollUpChildStates(ownStates)
    const rows: SupervisionRow[] = []
    for (const input of inputs) {
      const rolled = rootStates.get(input.id)
      if (!rolled) continue
      const session = sessionById.get(input.id)
      const projectLabel = supervisionProjectLabel(projects, input.projectId, input.directory ?? null, homeDirectory)
      const treeSessionIds = rolled.sessionIds
      const errorMessage =
        latestUnseenSessionErrorMessage(notifications, input.id) ??
        latestUnseenTreeSessionErrorMessage(notifications, treeSessionIds)
      const multiRun = readMultiRunIdentity(session)
      const goal = goals[input.id] ?? null
      rows.push({
        sessionId: input.id,
        title: input.title?.trim() || input.id,
        state: rolled.state,
        treeSessionIds,
        childSessions: childSessionSummaries(input.id, treeSessionIds, childById),
        projectId: input.projectId,
        projectLabel,
        directory: input.directory ?? null,
        // Only this root row's own goal moves its activity time, so a
        // goal-only change still reads as activity since the last visit.
        updatedAt: goal ? Math.max(input.updatedAt ?? 0, goalRevision(goal)) : (input.updatedAt ?? 0),
        evidence: resolveSupervisionEvidence(session?.summary as SessionSummaryLike | undefined),
        goal,
        checks: verificationEvidenceFor(input.id, input.directory ?? null, verificationEntries),
        activity: activityBySession.get(input.id) ?? null,
        ...(errorMessage ? { errorMessage } : {}),
        ...(multiRun ? { multiRun } : {}),
      })
    }
    return rankSupervisionRows(rows)
  }, [activityBySession, goals, homeDirectory, inputs, notifications, projects, sessions, statuses, verificationEntries])
}

/**
 * Root-session previews from the directory stores already in memory. The snapshot keeps its
 * reference when a part delta does not change the preview text, so the row memo does not
 * publish a new array on every streamed token.
 */
function useRootActivity(
  inputs: readonly { id: string; directory?: string | null }[],
  sessions: readonly { id: string; parentID?: string | null }[],
): ReadonlyMap<string, ActivityPreview> {
  const childStores = useChildStoreManager()
  const targets = React.useMemo(() => rootActivityTargets(inputs, sessions), [inputs, sessions])
  const activity = React.useMemo(() => {
    let cachedDeps: readonly unknown[] | null = null
    let cachedResult: ReadonlyMap<string, ActivityPreview> | null = null
    let dirty = true
    const getSnapshot = () => {
      if (!dirty && cachedResult) return cachedResult
      dirty = false
      const directories = readActivityDirectories(childStores)
      const deps = activitySliceDeps(targets, directories)
      if (cachedDeps && areSliceDepsEqual(cachedDeps, deps)) return cachedResult ?? retainActivityMap(null, new Map())
      const next = collectActivityPreviews(targets, directories)
      cachedResult = retainActivityMap(cachedResult, next)
      cachedDeps = deps
      return cachedResult
    }
    const subscribe = (notify: () => void) => {
      const invalidate = () => {
        dirty = true
        notify()
      }
      const coalesced = createCoalescedNotify(invalidate, setTimeout, clearTimeout)
      const unsubscribe = childStores.subscribeAll(coalesced.notify)
      const unsubscribeRegistry = childStores.subscribeRegistry(coalesced.flush)
      // Cover a store change between render and subscription. Target changes create a fresh snapshot.
      dirty = true
      return () => {
        unsubscribe()
        unsubscribeRegistry()
        coalesced.dispose()
      }
    }
    return { getSnapshot, subscribe }
  }, [childStores, targets])
  return React.useSyncExternalStore(activity.subscribe, activity.getSnapshot, activity.getSnapshot)
}

function rootActivityTargets(
  inputs: readonly { id: string; directory?: string | null }[],
  sessions: readonly { id: string; parentID?: string | null }[],
): ActivityTarget[] {
  const sessionById = new Map(sessions.map((session) => [session.id, session]))
  const inputIds = new Set(inputs.map((input) => input.id))
  const targets: ActivityTarget[] = []
  for (const input of inputs) {
    const parentId = sessionById.get(input.id)?.parentID ?? null
    const isChild = typeof parentId === "string" && parentId.length > 0 && inputIds.has(parentId)
    if (isChild) continue
    targets.push({ sessionId: input.id, directory: input.directory ?? null })
  }
  return targets
}

function readActivityDirectories(childStores: {
  children: ReadonlyMap<string, { getState: () => ActivityDirectorySource }>
}): ActivityDirectory[] {
  const directories: ActivityDirectory[] = []
  for (const [directory, store] of childStores.children) {
    const state = store.getState()
    directories.push({
      directory,
      todo: state.todo,
      message: state.message,
      part: state.part,
    })
  }
  return directories
}

interface ActivityDirectorySource {
  todo: ActivityDirectory["todo"]
  message: ActivityDirectory["message"]
  part: ActivityDirectory["part"]
}
