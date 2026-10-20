import { createHash } from "node:crypto"

const SCRIPT_ELEMENT_PATTERN = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi
const SCRIPT_SRC_ATTRIBUTE_PATTERN = /(?:^|\s)src\s*=/i
const SCRIPT_TYPE_ATTRIBUTE_PATTERN = /(?:^|\s)type\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i
const EXECUTABLE_SCRIPT_TYPES = new Set(["", "text/javascript", "application/javascript", "module"])

// SHA-256 sources for the inline scripts in one HTML document (ADR-018). The
// browser hashes script text after HTML input preprocessing, which turns CRLF
// and lone CR into LF, so the digest is taken over normalized text. Scripts
// with a src attribute and non-executable data blocks (JSON, importmap) are
// not hashed: CSP hash sources never apply to them.
const collectInlineScriptHashes = (html) => {
  const text = String(html ?? "").replace(/\r\n?/g, "\n")
  const hashes = new Set()
  for (const match of text.matchAll(SCRIPT_ELEMENT_PATTERN)) {
    const attributes = match[1] || ""
    if (SCRIPT_SRC_ATTRIBUTE_PATTERN.test(attributes)) continue
    const typeMatch = attributes.match(SCRIPT_TYPE_ATTRIBUTE_PATTERN)
    const type = (typeMatch ? (typeMatch[1] ?? typeMatch[2] ?? typeMatch[3] ?? "") : "").trim().toLowerCase()
    if (!EXECUTABLE_SCRIPT_TYPES.has(type)) continue
    const digest = createHash("sha256").update(match[2], "utf8").digest("base64")
    hashes.add(`'sha256-${digest}'`)
  }
  return [...hashes].sort()
}

export { collectInlineScriptHashes }
