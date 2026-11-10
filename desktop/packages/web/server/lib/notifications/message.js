const DEFAULT_NOTIFICATION_MESSAGE_MAX_LENGTH = 250

const resolvePositiveNumber = (value, fallback) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return fallback
  }
  return value
}

// Code spans are set aside before the emphasis passes so their text reaches the notification verbatim; NUL never
// appears in a chat message worth showing, so it can delimit the placeholders.
const CODE_SPAN_PLACEHOLDER_PATTERN = /\u0000(\d+)\u0000/g

const normalizeNotificationPlainText = (text) => {
  if (typeof text !== "string") {
    return ""
  }

  const codeSpans = []
  return text
    .replace(/\u0000/g, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, (_match, code) => {
      codeSpans.push(code)
      return `\u0000${codeSpans.length - 1}\u0000`
    })
    .replace(/^[\t ]*[-*+]\s+/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    // Underscore emphasis cannot open or close inside a word (CommonMark), so `file_name_utils.py` keeps its name.
    .replace(/(^|[^\p{L}\p{N}_])__(.+?)__(?![\p{L}\p{N}_])/gu, "$1$2")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/(^|[^\p{L}\p{N}_])_(.+?)_(?![\p{L}\p{N}_])/gu, "$1$2")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(CODE_SPAN_PLACEHOLDER_PATTERN, (_match, index) => codeSpans[Number(index)] ?? "")
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
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
  const plainTextMessage = normalizeNotificationPlainText(originalMessage)
  return truncateNotificationText(plainTextMessage, maxLastMessageLength)
}
