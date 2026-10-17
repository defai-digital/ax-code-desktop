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

/**
 * Keep an answered marker while the server still lists the request, and forget it when the request is gone. The
 * marker exists to stop a second answer while the server has not yet processed the first; a resync can republish
 * the same pending request with a fresh object, so object identity would clear the marker and reopen the hole.
 */
export const pruneAnsweredRequestIds = (answered: Set<string>, permissions: readonly PermissionRequest[]): void => {
  const liveRequestIds = new Set(permissions.map((permission) => permission.id))
  for (const requestId of answered) {
    if (!liveRequestIds.has(requestId)) answered.delete(requestId)
  }
}
