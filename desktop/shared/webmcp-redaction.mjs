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
]

/** Key or field names whose values are never shown, whatever the value looks like. */
export const WEBMCP_SENSITIVE_NAME =
  /password|passwd|passphrase|secret|token|credential|api.?key|access.?key|private.?key|authorization|bearer|cookie|session|otp|one.?time|pin\b|cvv|cvc|card.?number|recovery|seed/i

export function webMcpTextLooksSensitive(value) {
  // Inspect embedded assignments independently of JSON parsing: diagnostics, fences and quoted
  // JSON strings are all text. Decode escape layers only for detection; never return decoded data.
  let text = value
  while (true) {
    const decoded = text.replace(
      /\\(?:u([0-9a-f]{4})|x([0-9a-f]{2})|(["'`\\/])|([nrtbf]))/gi,
      (_match, unicode, hex, literal) =>
        literal ?? (unicode || hex ? String.fromCharCode(parseInt(unicode || hex, 16)) : " "),
    )
    if (decoded === text) break
    text = decoded
  }
  // URL credentials can occur inside prose, JSON, or diagnostics. URLSearchParams decodes
  // query names (including percent escapes) without decoding or returning the secret value.
  for (const match of text.matchAll(/(?:\b[a-z][a-z0-9+.-]*:)?\/\/[^\s<>"'`]+/gi)) {
    try {
      const url = new URL(match[0], "https://redaction.invalid")
      if (url.username || url.password) return true
      for (const name of url.searchParams.keys()) {
        if (WEBMCP_SENSITIVE_NAME.test(name)) return true
      }
    } catch {
      // Malformed URLs still receive assignment and credential-shape checks below.
    }
  }
  if (WEBMCP_CREDENTIALS.some((pattern) => pattern.test(text))) return true
  // Use the same sensitive-name vocabulary as object fields, including prefixed keys.
  // Anchor unquoted keys at token boundaries to avoid rescanning long plain-text tokens.
  const assignments = /(?:["'`]([^"'`\r\n]+)["'`]|(?<![^\s"'`{}\[\],:=])([^\s"'`{}\[\],:=]+))\s*[:=]/g
  for (const match of text.matchAll(assignments)) {
    if (WEBMCP_SENSITIVE_NAME.test(match[1] ?? match[2])) return true
  }
  return false
}

/** Preserve report structure while filtering the same keys and credential shapes as the UI.
 * JSON-encoded outputs are decoded before filtering and encoded again to keep their wire type.
 * No truncation: report occurrence checks still need complete non-sensitive inputs.
 */
export function redactWebMcpReport(value, replacement = "[redacted]") {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      if (parsed && typeof parsed === "object") return JSON.stringify(redactWebMcpReport(parsed, replacement))
    } catch {
      // Plain text still needs credential filtering.
    }
    return webMcpTextLooksSensitive(value) ? replacement : value
  }
  if (Array.isArray(value)) return value.map((entry) => redactWebMcpReport(entry, replacement))
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        webMcpTextLooksSensitive(key) ? replacement : key,
        WEBMCP_SENSITIVE_NAME.test(key) && entry !== null && entry !== ""
          ? replacement
          : redactWebMcpReport(entry, replacement),
      ]),
    )
  }
  return value
}

/** Display text keeps its formatting; callers truncate only after credential filtering. */
export function redactWebMcpText(value) {
  return redactWebMcpReport(value)
}
