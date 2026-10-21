"use strict"

// Main-process projection, also used by renderer contract fixtures. Never bundled into the renderer.
const { randomBytes } = require("node:crypto")
const { definitionDigest, catalogDigest } = require("./webmcp-digests.cjs")
const { webMcpDisplayText, webMcpDisplayDescription, webMcpDisplaySchema } = require("./webmcp-redaction.mjs")
const byteSize = (value) => Buffer.byteLength(JSON.stringify(value) ?? "", "utf8")

// The panel lists a bounded projection. The adapter may hold more (up to 128 tools); the counts
// below are what the builder is shown, and a truncation reason says which cap applied.
const CATALOG_MAX_TOOLS = 64
const CATALOG_MAX_BYTES = 262144
const IDENTITY_MAX_ENTRIES = 256
const IDENTITY_RECENT_CATALOGS = 32
const identityStates = new WeakMap()
const plainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value)

function publicAnnotations(annotations) {
  if (!plainObject(annotations)) return undefined
  const hints = {
    readOnlyHint: annotations.readOnlyHint === true || annotations.readOnly === true,
    untrustedContentHint: annotations.untrustedContentHint === true || annotations.untrustedContent === true,
    consequentialHint: annotations.consequentialHint === true || annotations.consequential === true,
  }
  if (!hints.readOnlyHint && !hints.untrustedContentHint && !hints.consequentialHint) return undefined
  return hints
}

// The registry belongs to one view. Real names stay in main; labels and IDs survive schema edits.
function projectToolCatalog(tools, kinds = new Map(), identities = new Map(), origin = "") {
  let state = identityStates.get(identities)
  if (!state) {
    state = { revision: 0, nextOrdinal: 1, seen: new Map() }
    identityStates.set(identities, state)
  }
  const revision = ++state.revision
  const catalog = []
  let bytes = 0
  let truncation = null
  const list = Array.isArray(tools) ? tools : []
  // Retain already-issued identities even when a live tool falls beyond the display cap.
  for (const tool of list) {
    const key = JSON.stringify([origin, tool.name])
    if (identities.has(key)) state.seen.set(key, revision)
  }
  for (const tool of list) {
    if (catalog.length >= CATALOG_MAX_TOOLS) {
      truncation = "count"
      break
    }
    const identityKey = JSON.stringify([origin, tool.name])
    let identity = identities.get(identityKey)
    if (!identity) {
      const redacted = webMcpDisplayText(tool.name) !== tool.name
      const ordinal = redacted ? state.nextOrdinal++ : 0
      identity = { invocationID: randomBytes(32).toString("hex"), redacted,
        name: redacted ? `[redacted tool ${ordinal}]` : tool.name }
      identities.set(identityKey, identity)
    }
    // Refresh insertion order for bounded LRU eviction, without changing a live identity or label.
    identities.delete(identityKey)
    identities.set(identityKey, identity)
    state.seen.set(identityKey, revision)
    const annotations = publicAnnotations(tool.annotations)
    const entry = {
      name: identity.name,
      description: webMcpDisplayDescription(tool.description ?? ""),
      ...(tool.inputSchema ? {
        inputSchema: webMcpDisplaySchema(tool.inputSchema),
        // Only input construction uses this exact copy; display and diagnosis use inputSchema.
        executionSchema: structuredClone(tool.inputSchema),
      } : {}),
      ...(annotations ? { annotations } : {}),
      kind: kinds.get(tool.name) === "form" ? "form" : "script",
      digest: catalogDigest(tool),
      definitionDigest: definitionDigest(tool),
      invocationID: identity.invocationID,
    }
    const size = Math.max(byteSize(tool), byteSize(entry))
    if (bytes + size > CATALOG_MAX_BYTES) {
      truncation = "bytes"
      break
    }
    bytes += size
    catalog.push(entry)
  }
  for (const key of identities.keys()) {
    const seen = state.seen.get(key) ?? 0
    if (seen !== revision && (revision - seen > IDENTITY_RECENT_CATALOGS || identities.size > IDENTITY_MAX_ENTRIES)) {
      identities.delete(key)
      state.seen.delete(key)
    }
  }
  return { catalog, total: list.length, truncation }
}

module.exports = { projectToolCatalog, CATALOG_MAX_TOOLS, CATALOG_MAX_BYTES, IDENTITY_MAX_ENTRIES, IDENTITY_RECENT_CATALOGS }
