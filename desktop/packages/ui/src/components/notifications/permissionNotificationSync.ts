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
 * Keep an answered marker only while the server still lists the exact request object that was answered. A
 * re-prompt replaces the object; pruning by id alone would hide the new, genuine request from the bell.
 */
export const pruneAnsweredPermissions = (
  answered: Map<string, PermissionRequest>,
  permissions: readonly PermissionRequest[],
): void => {
  const liveById = new Map(permissions.map((permission) => [permission.id, permission]))
  for (const [requestId, answeredPermission] of answered) {
    if (liveById.get(requestId) !== answeredPermission) answered.delete(requestId)
  }
}
