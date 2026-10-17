import React from "react"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { useUIStore } from "@/stores/useUIStore"
import { useAttentionStore } from "@/stores/useAttentionStore"
import { useSessionPermissions, useAllLiveSessions, usePendingPermissionSessionIds } from "@/sync/sync-context"
import { getRegisteredRuntimeAPIs } from "@/contexts/runtimeAPIRegistry"
import { isDesktopShell } from "@/lib/desktop"
import { setDesktopBadgeCount } from "@/lib/desktopNative"
import { useI18n } from "@/lib/i18n"
import { useNotificationStore } from "@/stores/useNotificationStore"
import * as sessionActions from "@/sync/session-actions"
import { toast } from "@/components/ui"
import { diffPermissionNotifications } from "./permissionNotificationSync"
import type { NotificationPayload } from "@/lib/api/types"

const PERMISSION_NOTIFY_DEBOUNCE_MS = 2000

// Requests already answered, by session. Module scope: the watcher unmounts and remounts with the live-session
// list, and a per-mount set would re-mirror a settled request on the next mount.
const answeredRequestIdsBySession = new Map<string, Set<string>>()

const answeredRequestIdsFor = (sessionId: string): Set<string> => {
  let answered = answeredRequestIdsBySession.get(sessionId)
  if (!answered) {
    answered = new Set()
    answeredRequestIdsBySession.set(sessionId, answered)
  }
  return answered
}

const isAppFocused = (): boolean => {
  if (typeof document === "undefined") return true
  return document.visibilityState === "visible" && document.hasFocus()
}

const isViewingSession = (sessionId: string): boolean =>
  isAppFocused() && useSessionUIStore.getState().currentSessionId === sessionId

function SessionPermissionWatcher({
  sessionId,
  sessionTitle,
  sessionDirectory,
}: {
  sessionId: string
  sessionTitle?: string
  sessionDirectory?: string
}): null {
  const { t } = useI18n()
  // The session's own directory, not the active one: a pending request from another
  // project lives in that project's child store, so reading the active store would
  // report nothing and the request would never reach the notification center.
  const permissions = useSessionPermissions(sessionId, sessionDirectory)
  const notifyOnPermission = useUIStore((s) => s.notifyOnPermission)
  const nativeNotificationsEnabled = useUIStore((s) => s.nativeNotificationsEnabled)
  const notificationMode = useUIStore((s) => s.notificationMode)
  // Subscribed (not just read imperatively) so the effect re-evaluates when
  // the user navigates away from a session with a still-pending request.
  const currentSessionId = useSessionUIStore((s) => s.currentSessionId)

  const hasPermissions = permissions.length > 0
  const enabled = notifyOnPermission && nativeNotificationsEnabled
  const notifiedRef = React.useRef(false)
  // requestId → notificationId for items mirrored into the notification center.
  const mirroredNotificationIdsRef = React.useRef<Map<string, string>>(new Map())

  // Mirror pending permission requests into the in-app notification center so
  // the header bell shows actionable Allow/Deny items. Requests answered
  // elsewhere (e.g. the in-chat permission card) are removed again.
  React.useEffect(() => {
    const store = useNotificationStore.getState()
    const seen = mirroredNotificationIdsRef.current
    // The center can be emptied from outside this mirror ("Clear all", or the
    // 100-item cap). Drop ids that are no longer present, or a still-pending
    // request would never be mirrored again.
    for (const [requestId, notificationId] of seen) {
      if (!store.notifications.some((notification) => notification.id === notificationId)) {
        seen.delete(requestId)
      }
    }
    const answered = answeredRequestIdsFor(sessionId)
    const { toAdd, toRemove } = diffPermissionNotifications(seen, permissions, answered)

    for (const { requestId, notificationId } of toRemove) {
      store.removeNotification(notificationId)
      seen.delete(requestId)
    }

    for (const permission of toAdd) {
      const respond = (response: "once" | "reject") => async () => {
        try {
          await sessionActions.respondToPermission(sessionId, permission.id, response)
        } catch (error) {
          console.error("[PermissionNotifications] Failed to respond to permission:", error)
          toast.error(t("chat.permissionCard.responseFailed.title"), {
            description: error instanceof Error ? error.message : t("chat.permissionCard.responseFailed.retry"),
          })
          // Rethrown for the entry that offers Allow/Deny: it takes the failure as "the request is still pending"
          // and keeps itself, which is the only handle the user has on it from the bell.
          throw error
        }
        // The server may still list the request as pending until its own event arrives. Mark it so this effect
        // does not mirror it again (with fresh buttons) the next time `permissions` changes, and drop the mirror.
        answeredRequestIdsFor(sessionId).add(permission.id)
        for (const [requestId, notificationId] of seen) {
          if (requestId === permission.id) {
            store.removeNotification(notificationId)
            seen.delete(requestId)
          }
        }
      }
      const patternPreview = permission.patterns.filter(Boolean).slice(0, 2).join(" · ")
      const notificationId = store.addNotification({
        type: "permission",
        title: t("notificationCenter.permission.requestTitle", { tool: permission.permission }),
        message: patternPreview || sessionTitle || sessionId,
        sessionId,
        requestId: permission.id,
        toolName: permission.permission,
        onAllow: respond("once"),
        onDeny: respond("reject"),
      })
      seen.set(permission.id, notificationId)
    }
  }, [permissions, sessionId, sessionTitle, t])

  // Drop this session's mirrored notifications when the watcher unmounts
  // (session closed or app teardown).
  React.useEffect(() => {
    const seen = mirroredNotificationIdsRef.current
    return () => {
      const store = useNotificationStore.getState()
      for (const notificationId of seen.values()) {
        store.removeNotification(notificationId)
      }
      seen.clear()
    }
  }, [])

  React.useEffect(() => {
    if (!hasPermissions) {
      notifiedRef.current = false
      return
    }
    if (notifiedRef.current || !enabled) return
    // The server notifies on its own (its `requireHidden` rule covers the unfocused
    // window, and `always` mode covers every case), so this watcher must only fill
    // the gap the server leaves: the app focused while another session is on screen.
    if (notificationMode === "always") return
    if (!isAppFocused() || currentSessionId === sessionId) return

    const timer = setTimeout(() => {
      // Re-check at fire time: the user may have focused the session during
      // the debounce window.
      if (isViewingSession(sessionId)) return
      notifiedRef.current = true
      const payload: NotificationPayload & { sessionId?: string; directory?: string } = {
        title: t("notifications.permission.title"),
        body: sessionTitle
          ? t("notifications.permission.bodyWithTitle", { title: sessionTitle })
          : t("notifications.permission.body"),
        tag: `permission:${sessionId}`,
        sessionId,
        ...(sessionDirectory ? { directory: sessionDirectory } : {}),
      }
      const apis = getRegisteredRuntimeAPIs()
      void apis?.notifications?.notifyAgentCompletion(payload)
    }, PERMISSION_NOTIFY_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [sessionId, sessionTitle, hasPermissions, enabled, currentSessionId, sessionDirectory, notificationMode, t])

  return null
}

/**
 * Mirrors the waiting-for-approval session count to the dock/taskbar badge
 * (desktop shells) and the attention store (window-title fallback on web).
 */
function AttentionBadgeSync(): null {
  const count = usePendingPermissionSessionIds().size
  const setPendingApprovalCount = useAttentionStore((s) => s.setPendingApprovalCount)

  React.useEffect(() => {
    setPendingApprovalCount(count)
    if (isDesktopShell()) {
      void setDesktopBadgeCount(count)
    }
  }, [count, setPendingApprovalCount])

  React.useEffect(
    () => () => {
      useAttentionStore.getState().setPendingApprovalCount(0)
      if (isDesktopShell()) {
        void setDesktopBadgeCount(0)
      }
    },
    [],
  )

  return null
}

/**
 * Renders one invisible watcher per live session; each fires a native
 * notification when its session waits on a permission request and the user
 * is not already looking at it. Must be mounted inside SyncProvider.
 */
export function PermissionNotifications(): React.ReactNode {
  const sessions = useAllLiveSessions()

  return (
    <>
      <AttentionBadgeSync />
      {sessions.map((session) => (
        <SessionPermissionWatcher
          key={session.id}
          sessionId={session.id}
          sessionTitle={session.title}
          sessionDirectory={(session as { directory?: string | null }).directory ?? undefined}
        />
      ))}
    </>
  )
}
