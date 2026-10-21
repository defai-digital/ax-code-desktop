/**
 * Credential shapes shared by UI previews and checker reports.
 * Callers must not write the original value, an element ref, or a grant to storage.
 */
const WEBMCP_CREDENTIALS = [
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/,
  /\b(?:sk|rk)-[A-Za-z0-9][A-Za-z0-9_-]{16,}/,
  /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{16,}/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bBearer\s+\S{16,}/i,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
  // Any value after a credential keyword, however short (password=hunter2 must not show).
  /\b(?:api[_-]?key|secret|token|password|passwd|passphrase|access[_-]?key|authorization|cookie)\s*[:=]\s*['"]?\S+/i,
]

/** Key or field names whose values are never shown, whatever the value looks like. */
export const WEBMCP_SENSITIVE_NAME =
  /password|passwd|passphrase|secret|token|credential|api.?key|private.?key|authorization|bearer|cookie|session|otp|one.?time|pin\b|cvv|cvc|card.?number|recovery|seed/i

export function webMcpTextLooksSensitive(value) {
  return WEBMCP_CREDENTIALS.some((pattern) => pattern.test(value))
}

/** Preserve report structure while filtering the same keys and credential shapes as the UI.
 * JSON-encoded outputs are decoded before filtering and encoded again to keep their wire type.
 * No truncation: report occurrence checks still need complete non-sensitive inputs.
 */
export function redactWebMcpReport(value) {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      if (parsed && typeof parsed === "object") return JSON.stringify(redactWebMcpReport(parsed))
    } catch {
      // Plain text still needs credential filtering.
    }
    return webMcpTextLooksSensitive(value) ? "[redacted]" : value
  }
  if (Array.isArray(value)) return value.map(redactWebMcpReport)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        webMcpTextLooksSensitive(key) ? "[redacted]" : key,
        WEBMCP_SENSITIVE_NAME.test(key) && entry !== null && entry !== "" ? "[redacted]" : redactWebMcpReport(entry),
      ]),
    )
  }
  return value
}
