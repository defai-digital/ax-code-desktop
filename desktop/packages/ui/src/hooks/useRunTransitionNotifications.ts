import React from "react"

import { toast } from "@/components/ui"
import { getRegisteredRuntimeAPIs } from "@/contexts/runtimeAPIRegistry"
import { useConnectionStore, selectIsConnected } from "@/lib/event-stream/connection-state"
import type { NotificationPayload } from "@/lib/api/types"
import { useI18n } from "@/lib/i18n"
import {
  decideRunTransitionNotification,
  earliestScheduledRunTransition,
  reduceRunTransitions,
  type PendingRunTransition,
  type RunTransition,
  type RunTransitionKind,
} from "@/lib/supervision/runTransitions"
import { openSupervisedSession } from "@/lib/supervision/openSession"
import { useNotificationStore } from "@/stores/useNotificationStore"
import { useUIStore } from "@/stores/useUIStore"
import { useSupervisionRows, type SupervisionRow } from "@/hooks/useSupervisionRows"
import { useSessionUIStore } from "@/sync/session-ui-store"

const isAppFocused = (): boolean => {
  if (typeof document === "undefined") return true
  return document.visibilityState === "visible" && document.hasFocus()
}

type I18nKey = Parameters<ReturnType<typeof useI18n>["t"]>[0]

const ANNOUNCEMENT_COPY: Record<RunTransitionKind, { title: I18nKey; body: I18nKey }> = {
  finished: { title: "supervision.notify.finished.title", body: "supervision.notify.finished.body" },
  failed: { title: "supervision.notify.failed.title", body: "supervision.notify.failed.body" },
  goal: { title: "supervision.state.goal", body: "supervision.notify.goal.body" },
}

export const publishRunTransition = (
  transition: RunTransition,
  rows: readonly SupervisionRow[],
  t: ReturnType<typeof useI18n>["t"],
): void => {
  const settings = useUIStore.getState()
  const windowFocused = isAppFocused()
  const sessionOpen = useSessionUIStore.getState().currentSessionId === transition.sessionId
  const decision = decideRunTransitionNotification({
    kind: transition.kind,
    sessionOpen,
    windowFocused,
    settings: {
      notifyOnCompletion: settings.notifyOnCompletion,
      notifyOnError: settings.notifyOnError,
      notifyOnQuestion: settings.notifyOnQuestion,
      nativeNotificationsEnabled: settings.nativeNotificationsEnabled,
      notificationMode: settings.notificationMode,
    },
  })
  if (!decision.inApp && !decision.native) return

  const row = rows.find((candidate) => candidate.sessionId === transition.sessionId)
  const titleText = row?.title?.trim() || transition.sessionId
  const title = t(ANNOUNCEMENT_COPY[transition.kind].title)
  const body = t(ANNOUNCEMENT_COPY[transition.kind].body, { title: titleText })
  const target = {
    sessionId: transition.sessionId,
    ...(row?.projectId ? { projectId: row.projectId } : {}),
    ...(row?.directory ? { directory: row.directory } : {}),
  }

  if (decision.inApp && transition.kind === "goal") {
    // The bell lists follow-ups only. A blocked goal waits in Needs you, so it is announced once and not filed there.
    toast.warning(title, {
      id: `run-goal:${transition.sessionId}`,
      description: body,
      action: { label: t("supervision.request.open"), onClick: () => openSupervisedSession(target) },
    })
  } else if (decision.inApp) {
    useNotificationStore.getState().addNotification({
      type: "session",
      title,
      message: body,
      ...target,
      ...(row?.projectLabel ? { projectLabel: row.projectLabel } : {}),
    })
  }

  if (decision.native) {
    const payload: NotificationPayload = {
      title,
      body,
      tag: `run-${transition.kind}:${transition.sessionId}`,
      sessionId: transition.sessionId,
      ...(row?.directory ? { directory: row.directory } : {}),
    }
    void getRegisteredRuntimeAPIs()?.notifications?.notifyAgentCompletion(payload)
  }
}

/**
 * Notifies when a root session leaves an in-progress state for review/idle (finished) or error (failed).
 * The announcement waits out a short settle window and is cancelled if the root is in progress again
 * before it fires, so a stale idle during prompt spin-up does not announce twice.
 * The first snapshot after mount, and the first snapshot after the sync stream reconnects, are
 * baselines only. The server already sends the native completion and error notifications, so
 * this hook adds the in-app center entry and fills only the focused-window gap the server skips.
 */
export function useRunTransitionNotifications(enabled: boolean): void {
  const { t } = useI18n()
  const rows = useSupervisionRows()
  const connected = useConnectionStore(selectIsConnected)
  const pendingRef = React.useRef<Map<string, PendingRunTransition>>(new Map())
  const rowsRef = React.useRef(rows)
  rowsRef.current = rows

  React.useEffect(() => {
    if (!enabled || !connected) {
      pendingRef.current = new Map()
      return
    }
    if (typeof window === "undefined") return

    let cancelled = false
    const apply = (now: number) => {
      const reduced = reduceRunTransitions(pendingRef.current, rowsRef.current, now)
      pendingRef.current = reduced.pending
      if (!cancelled) {
        for (const transition of reduced.notify) publishRunTransition(transition, rowsRef.current, t)
      }
      return reduced.pending
    }

    let timer: number | null = null
    const arm = (pending: ReadonlyMap<string, PendingRunTransition>, now: number) => {
      const dueAt = earliestScheduledRunTransition(pending)
      if (dueAt === null) return
      timer = window.setTimeout(
        () => {
          timer = null
          if (cancelled) return
          const firedAt = Date.now()
          arm(apply(firedAt), firedAt)
        },
        Math.max(0, dueAt - now),
      )
    }

    const now = Date.now()
    arm(apply(now), now)
    return () => {
      cancelled = true
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [connected, enabled, rows, t])
}
