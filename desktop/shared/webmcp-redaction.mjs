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
  /\b(?:api[_-]?key|secret|token|password|passwd|passphrase|access[_-]?key|authorization|cookie)(?:\\*["'])?\s*[:=]\s*['"]?\S+/i,
]

/** Key or field names whose values are never shown, whatever the value looks like. */
export const WEBMCP_SENSITIVE_NAME =
  /password|passwd|passphrase|secret|token|credential|api.?key|private.?key|authorization|bearer|cookie|session|otp|one.?time|pin\b|cvv|cvc|card.?number|recovery|seed/i

export function webMcpTextLooksSensitive(value) {
  return WEBMCP_CREDENTIALS.some((pattern) => pattern.test(value))
}

/** Preserve report structure while filtering the same keys and credential shapes as the UI.
 * Decode JSON text (including encoded strings) before filtering, retaining its original wire type.
 * Unchanged text remains byte-for-byte intact. Bound nesting and replace cycles rather than throwing.
 */
export function redactWebMcpReport(value, replacement = "[redacted]") {
  const ancestors = new WeakSet()
  const replaced = () => ({ value: replacement, changed: true })
  const visit = (entry, depth) => {
    if (depth > 32) return replaced()
    if (typeof entry === "string") {
      let parsed
      try {
        parsed = JSON.parse(entry)
      } catch {
        // Embedded or truncated JSON is still checked for quoted credential keys below.
      }
      if (typeof parsed === "string" || (parsed && typeof parsed === "object")) {
        const safe = visit(parsed, depth + 1)
        return safe.changed
          ? { value: JSON.stringify(safe.value), changed: true }
          : { value: entry, changed: false }
      }
      return webMcpTextLooksSensitive(entry) ? replaced() : { value: entry, changed: false }
    }
    if (!entry || typeof entry !== "object") return { value: entry, changed: false }
    if (ancestors.has(entry)) return replaced()
    ancestors.add(entry)
    let changed = false
    try {
      if (Array.isArray(entry)) {
        const safe = entry.map((child) => {
          const result = visit(child, depth + 1)
          changed ||= result.changed
          return result.value
        })
        return { value: safe, changed }
      }
      const safe = Object.fromEntries(Object.entries(entry).map(([key, child]) => {
        const safeKey = webMcpTextLooksSensitive(key) ? replacement : key
        const result = WEBMCP_SENSITIVE_NAME.test(key) && child !== null && child !== ""
          ? replaced()
          : visit(child, depth + 1)
        changed ||= safeKey !== key || result.changed
        return [safeKey, result.value]
      }))
      return { value: safe, changed }
    } finally {
      ancestors.delete(entry)
    }
  }
  try {
    return visit(value, 0).value
  } catch {
    // A hostile accessor/proxy must never make the caller fall back to an unfiltered value.
    return replacement
  }
}
