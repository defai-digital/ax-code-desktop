"use strict"

const { createHash } = require("node:crypto")

const canonical = (value, depth = 0) => {
  if (depth > 32) throw new Error("WebMCP JSON nesting limit exceeded")
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item, depth + 1)).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key], depth + 1)}`)
      .join(",")}}`
  }
  return JSON.stringify(value) ?? "null"
}
const definitionDigest = (tool) => createHash("sha256").update(canonical(tool)).digest("hex")
// Identity of a tool for the builder. Frame ids change on reload, so they are not part of this digest:
// a same-definition reload must still match drafts and must not look like a schema change.
const catalogIdentity = (tool) => {
  const identity = { name: tool.name, description: tool.description }
  if (tool.inputSchema !== undefined) identity.inputSchema = tool.inputSchema
  if (tool.annotations !== undefined) identity.annotations = tool.annotations
  return identity
}
const catalogDigest = (tool) =>
  createHash("sha256")
    .update(canonical(catalogIdentity(tool)))
    .digest("hex")

module.exports = { definitionDigest, catalogDigest }
