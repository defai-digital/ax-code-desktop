import { sanitizeForNotification } from "../text/summarization.js"

const DEFAULT_NOTIFICATION_MESSAGE_MAX_LENGTH = 250

const resolvePositiveNumber = (value, fallback) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return fallback
  }
  return value
}

export const truncateNotificationText = (text, maxLength = DEFAULT_NOTIFICATION_MESSAGE_MAX_LENGTH) => {
  if (typeof text !== "string") {
    return ""
  }

  const safeMaxLength = resolvePositiveNumber(maxLength, DEFAULT_NOTIFICATION_MESSAGE_MAX_LENGTH)
  if (text.length <= safeMaxLength) {
    return text
  }

  // Never cut between the halves of a surrogate pair, which would leave a lone surrogate (rendered as U+FFFD).
  let end = Math.floor(safeMaxLength)
  const last = text.charCodeAt(end - 1)
  if (last >= 0xd800 && last <= 0xdbff) {
    end -= 1
  }
  return `${text.slice(0, end)}...`
}

export const prepareNotificationLastMessage = async ({ message, settings }) => {
  const originalMessage = typeof message === "string" ? message : ""
  if (!originalMessage) {
    return ""
  }

  const maxLastMessageLength = resolvePositiveNumber(
    settings?.maxLastMessageLength,
    DEFAULT_NOTIFICATION_MESSAGE_MAX_LENGTH,
  )
  const plainTextMessage = sanitizeForNotification(originalMessage)
  return truncateNotificationText(plainTextMessage, maxLastMessageLength)
}
