/**
 * The displayable message for a session error row, taken from the newest
 * unseen error notification for that session. Live session status has no
 * error variant, so the notification list is the only place a message lives.
 */

export interface SessionErrorNotificationLike {
  type?: string
  session?: string
  viewed?: boolean
  time?: number
  error?: { message?: string }
}

const MAX_ERROR_MESSAGE_LENGTH = 180

const capErrorMessage = (message: string): string =>
  message.length > MAX_ERROR_MESSAGE_LENGTH ? `${message.slice(0, MAX_ERROR_MESSAGE_LENGTH - 1)}…` : message

function latestForSessionIds(
  notifications: readonly SessionErrorNotificationLike[],
  sessionIds: ReadonlySet<string>,
): string | undefined {
  let best: { message: string; time: number; index: number } | null = null
  for (let index = 0; index < notifications.length; index += 1) {
    const notification = notifications[index]
    if (!notification || notification.type !== "error") continue
    if (!notification.session || !sessionIds.has(notification.session)) continue
    if (notification.viewed === true) continue
    const raw = notification.error?.message
    if (typeof raw !== "string") continue
    const message = raw.trim()
    if (!message) continue
    const time = notification.time ?? 0
    if (!best || time > best.time || (time === best.time && index > best.index)) {
      best = { message, time, index }
    }
  }
  return best ? capErrorMessage(best.message) : undefined
}

export function latestUnseenSessionErrorMessage(
  notifications: readonly SessionErrorNotificationLike[],
  sessionId: string,
): string | undefined {
  return latestForSessionIds(notifications, new Set([sessionId]))
}

/** Newest unseen error message across a root session and its loaded subagent sessions. */
export function latestUnseenTreeSessionErrorMessage(
  notifications: readonly SessionErrorNotificationLike[],
  sessionIds: readonly string[],
): string | undefined {
  return latestForSessionIds(notifications, new Set(sessionIds))
}
