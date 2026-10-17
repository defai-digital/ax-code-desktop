/**
 * Shared text summarization service.
 *
 * Modes:
 * - summary: concise plain text
 * - notification: concise notification text
 * - note: distilled project note
 */

// One scheme URL. It may not start inside another scheme-character run (`com.apple.dt.xcode://` is not
// `xcode://`), which also keeps an unbounded scheme linear: only the first character of a run can start a match.
// A leading digit is accepted even though it is not a legal scheme, because the point is to stop the path after
// `://` from reaching the summary. The match stops before trailing punctuation and closing brackets, which belong
// to the sentence rather than the link.
const SCHEME_URL = /(?<![a-z0-9+.-])[a-z0-9][a-z0-9+.-]*:\/\/[^\s]*[^\s.,;:!?)\]}]/gi

export function sanitizeForSummary(text) {
  if (!text || typeof text !== "string") return ""

  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/[*_~`#]/g, "")
    .replace(/^\s*[$#>]\s*/gm, "")
    .replace(/[|&;<>]/g, " ")
    .replace(/\\/g, "")
    // A scheme URL is one link, not a path: the path pass below accepts a colon before the slash, so
    // `ssh://git@host/r` otherwise lost `//git` and kept a scheme-shaped remnant. No trailing space: the
    // punctuation just after the match belongs to the sentence.
    .replace(SCHEME_URL, " a link")
    // The path pass runs before the brackets go, and lets the punctuation that can precede a path stand in for the
    // word boundary: `[label](/etc)` and `file:/etc` are paths even though no whitespace comes before the slash.
    // Inside a word a slash is not a path — `either/or` and `TCP/IP` keep both halves — so a word character before
    // it rules the run out. A double slash after a colon is a scheme that the link pass left alone, not a path.
    // The whole run goes, trailing separator included.
    .replace(/(^|[\s:([{"'])\/(?!\/)[\w\-./]+/g, "$1")
    .replace(/[\[\]{}()]/g, "")
    .replace(/["']/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

export function sanitizeForNotification(text) {
  if (!text || typeof text !== "string") return ""

  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/^[\t ]*[-*+]\s+/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function sanitizeForNote(text) {
  if (!text || typeof text !== "string") return ""

  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(SCHEME_URL, "")
    .replace(/["']/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function sanitizeByMode(text, mode) {
  if (mode === "note") return sanitizeForNote(text)
  if (mode === "notification") return sanitizeForNotification(text)
  return sanitizeForSummary(text)
}

function distillNoteFallback(text, maxLength) {
  const sanitized = sanitizeForNote(text)
  if (!sanitized) return ""

  const normalized = sanitized
    .replace(/^In summary[:,]?\s*/i, "")
    .replace(/^Here(?:s| is) (?:a )?note[:,]?\s*/i, "")
    .trim()

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)

  const best = (sentences[0] || normalized)
    .split(/[;:()-]\s+/)[0]
    .split(/,\s+/)[0]
    .trim()
  const idealLimit = Math.min(maxLength, Math.max(32, Math.floor(normalized.length * 0.65)))

  if (best.length <= idealLimit) return best

  const clipped = best.slice(0, Math.max(0, idealLimit - 1)).trim()
  return clipped ? `${clipped}…` : best.slice(0, idealLimit).trim()
}

function distillNotificationFallback(text, maxLength) {
  const sanitized = sanitizeForNotification(text)
  if (!sanitized) return ""

  const sentences = sanitized
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
  const candidate = sentences.find((sentence) => sentence.length >= 20) || sentences[0] || sanitized
  const limit = Number.isFinite(maxLength) ? Math.max(20, Math.floor(maxLength)) : 100
  if (candidate.length <= limit) return candidate

  const clipped = candidate.slice(0, Math.max(0, limit - 1)).trim()
  return clipped ? `${clipped}…` : candidate.slice(0, limit).trim()
}

function fallbackByMode(text, maxLength, mode) {
  if (mode === "note") return distillNoteFallback(text, maxLength)
  if (mode === "notification") return distillNotificationFallback(text, maxLength)
  return sanitizeByMode(text, mode)
}

export async function summarizeText({ text, threshold = 200, maxLength = 500, zenModel, mode = "summary" }) {
  void zenModel

  const summary = fallbackByMode(text || "", maxLength, mode)
  if (!text || text.length <= threshold) {
    return {
      summary,
      summarized: false,
      reason: text ? "Text under threshold" : "No text provided",
    }
  }

  return {
    summary,
    summarized: false,
    reason: "Model summarization provider unavailable",
    originalLength: text.length,
    summaryLength: summary.length,
  }
}
