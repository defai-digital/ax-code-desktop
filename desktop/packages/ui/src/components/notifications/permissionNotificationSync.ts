import type { PermissionRequest } from "@/types/permission"

type PermissionNotificationDiff = {
  /** Live requests that have no mirrored notification yet. */
  toAdd: PermissionRequest[]
  /** Mirrored notifications whose request is no longer pending. */
  toRemove: Array<{ requestId: string; notificationId: string }>
}

/**
 * Diff the set of mirrored permission notifications (requestId → notificationId)
 * against the currently pending permission requests for a session. Requests
 * answered elsewhere (e.g. the in-chat permission card) drop out of the sync
 * array, so their mirrored notifications must be removed to keep every item in
 * the notification center actionable.
 *
 * `answered` holds requests whose answer already settled while the server still
 * listed them as pending. Without it the next run saw an unmapped request and
 * mirrored it again, with buttons that answered a settled request a second time.
 */
export const diffPermissionNotifications = (
  seen: ReadonlyMap<string, string>,
  permissions: readonly PermissionRequest[],
  answered: ReadonlySet<string> = new Set(),
): PermissionNotificationDiff => {
  const toAdd = permissions.filter((permission) => !seen.has(permission.id) && !answered.has(permission.id))
  const liveRequestIds = new Set(permissions.map((permission) => permission.id))
  const toRemove: PermissionNotificationDiff["toRemove"] = []
  for (const [requestId, notificationId] of seen) {
    if (!liveRequestIds.has(requestId)) {
      toRemove.push({ requestId, notificationId })
    }
  }
  return { toAdd, toRemove }
}

/*
 * Markers are not pruned. `useSessionPermissions` returns an empty list for one run when the session's directory
 * is not resolved yet, and dropping a marker on that run reopened the double mirror the marker exists to close.
 * The set is one small string per permission answered in the session and lives for the process, which is the price
 * of surviving both a resync and a watcher remount; nothing else removes it.
 */
