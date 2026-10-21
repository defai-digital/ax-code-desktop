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
  /\b(?:Bearer|Basic)\s+\S+/i,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
]

/** Key or field names whose values are never shown, whatever the value looks like. */
export const WEBMCP_SENSITIVE_NAME =
  /(?:^|[\s._-])(?:sig|signature|policy|key[\s._-]*pair[\s._-]*id)$|password|passwd|passphrase|secret|token|credential|api[\s._-]*key|access[\s._-]*key|private[\s._-]*key|authorization|bearer|cookie|session|otp|one[\s._-]*time|pin\b|cvv|cvc|card[\s._-]*number|recovery|seed/i

// Explicit credential names are sensitive regardless of the value length.
function sensitiveParameterName(value, urlContext = false) {
  let name = value.replaceAll("+", " ").trim()
  for (let layer = 0; ; layer++) {
    const decoded = name.replace(/%([0-9a-f]{2})/gi, (_match, hex) => String.fromCharCode(parseInt(hex, 16)))
    if (decoded === name) return WEBMCP_SENSITIVE_NAME.test(name) || (urlContext && /^(?:code|state)$/i.test(name))
    // Unknown deeply encoded names fail closed, as deeply escaped diagnostics do.
    if (layer >= 31) return true
    name = decoded
  }
}

export function webMcpTextLooksSensitive(value) {
  // Inspect embedded assignments independently of JSON parsing: diagnostics, fences and quoted
  // JSON strings are all text. Decode escape layers only for detection; never return decoded data.
  let text = value
  for (let layer = 0; ; layer++) {
    const decoded = text.replace(
      /\\(?:u([0-9a-f]{4})|x([0-9a-f]{2})|(["'`\\/])|([nrtbf]))/gi,
      (_match, unicode, hex, literal) =>
        literal ?? (unicode || hex ? String.fromCharCode(parseInt(unicode || hex, 16)) : " "),
    )
    if (decoded === text) break
    // Unknown deeply escaped text fails closed instead of consuming unbounded decode work.
    if (layer >= 31) return true
    text = decoded
  }
  // URL credentials can occur inside prose, JSON, or diagnostics. Inspect the raw address
  // too: URL normalization can remove path segments that contained credential assignments.
  for (const match of text.matchAll(/(?:\b[a-z][a-z0-9+.-]*:)?\/\/[^\s<>"'`]+/gi)) {
    try {
      const url = new URL(match[0], "https://redaction.invalid")
      if (url.username || url.password) return true
      // Query, hash routes, and path/matrix parameters can all carry credentials.
      // Decode names only, including nested encodings and malformed escape sequences.
      for (const part of [match[0], url.search, url.hash, url.pathname]) {
        for (const pair of part.split(/[?&#/;\\]/)) {
          const equals = pair.indexOf("=")
          if (equals < 0) continue
          if (pair.slice(equals + 1).trim() && sensitiveParameterName(pair.slice(0, equals), part === url.search || part === url.hash)) return true
        }
      }
    } catch {
      // Malformed URLs still receive assignment and credential-shape checks below.
    }
  }
  for (const pair of text.matchAll(/[?&#/;]([^\s?&#/;=]+)=([^\s&#"'`]+)/g)) {
    if (sensitiveParameterName(pair[1])) return true
  }
  if (WEBMCP_CREDENTIALS.some((pattern) => pattern.test(text))) return true
  // Use the same sensitive-name vocabulary as object fields, including prefixed keys.
  // Anchor unquoted keys at token boundaries to avoid rescanning long plain-text tokens.
  const assignments = /(?:["'`]([^"'`]+)["'`]|(?<![^\s"'`{}\[\],:=])([^"'`{}\[\],:=]+))\s*[:=]/g
  for (const match of text.matchAll(assignments)) {
    if (!sensitiveParameterName(match[1] ?? match[2])) continue
    // A second display/storage boundary must preserve already filtered diagnostics. Only a
    // complete quoted placeholder is safe; suffixes or additional assignments still get checked.
    const tail = text.slice(match.index + match[0].length)
    if (/^\s*(["'`])(?:\[redacted\]|<fill in>)\1(?=\s*[,}\]\r\n]|\s*$)/.test(tail)) continue
    return true
  }
  return false
}

/** Preserve report structure while filtering the same keys and credential shapes as the UI.
 * Decode JSON text (including encoded strings) before filtering, retaining its original wire type.
 * Unchanged text remains byte-for-byte intact. Bound nesting and replace cycles rather than throwing.
 */
export function redactWebMcpReport(value, replacement = "[redacted]") {
  const ancestors = new WeakSet()
  let remaining = 100000
  const replaced = () => ({ value: replacement, changed: true })
  const visit = (entry, depth) => {
    if (--remaining < 0) throw new Error("Redaction traversal budget exceeded")
    if (depth > 32) return replaced()
    if (typeof entry === "string") {
      let parsed
      try {
        parsed = JSON.parse(entry)
      } catch (error) {
        if (!(error instanceof SyntaxError)) return replaced()
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

/** Display text keeps its formatting; callers truncate only after credential filtering. */
export function redactWebMcpText(value) {
  return redactWebMcpReport(value)
}

/** Bounded page-authored text at IPC and display boundaries. Filter before truncating. */
export function webMcpDisplayText(value) {
  return redactWebMcpText(value).slice(0, 4000)
}

/** Match the native registration limit for descriptions in every display projection. */
export function webMcpDisplayDescription(value) {
  return redactWebMcpText(value).slice(0, 4096)
}

/** Preserve structure while bounding every string in a page-authored display projection. */
export function webMcpDisplaySchema(value) {
  let remaining = 100000
  const bound = (entry, depth = 0) => {
    if (--remaining < 0 || depth > 32) return "[redacted]"
    if (typeof entry === "string") return webMcpDisplayText(entry)
    if (Array.isArray(entry)) return entry.map((child) => bound(child, depth + 1))
    if (entry && typeof entry === "object")
      return Object.fromEntries(Object.entries(entry).map(([key, child]) => [webMcpDisplayText(key), bound(child, depth + 1)]))
    return entry
  }
  return bound(value)
}

/** Tool output and diagnostics also redact values identified by sensitive field names. */
export function webMcpDisplayReport(value) {
  return webMcpDisplaySchema(redactWebMcpReport(value))
}

/** Inspect schema property names at every depth without changing executable values. */
export function webMcpSchemaLooksSensitive(schema) {
  const seen = new WeakSet()
  const visit = (value) => {
    if (!value || typeof value !== "object" || seen.has(value)) return false
    seen.add(value)
    if (value.properties && Object.keys(value.properties).some((key) => WEBMCP_SENSITIVE_NAME.test(key))) return true
    return Object.values(value).some(visit)
  }
  return visit(schema)
}
