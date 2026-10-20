"use strict"

// Argument validation for desktop IPC commands (ADR-019,
// SPEC-2026-10-19-desktop-ipc-contract-v2). The contract JSON is the single
// source: commands that declare `params` are checked before their handler runs;
// commands without `params` are passed through unchanged during migration.

const PARAM_TYPES = new Set(["string", "number", "integer", "boolean", "object", "array", "string[]"])

const describe = (value) => {
  if (value === null) return "null"
  if (Array.isArray(value)) return "array"
  return typeof value
}

const matchesType = (type, value) => {
  switch (type) {
    case "string":
      return typeof value === "string"
    case "number":
      return typeof value === "number" && Number.isFinite(value)
    case "integer":
      return Number.isInteger(value)
    case "boolean":
      return typeof value === "boolean"
    case "object":
      return value !== null && typeof value === "object" && !Array.isArray(value)
    case "array":
      return Array.isArray(value)
    case "string[]":
      return Array.isArray(value) && value.every((item) => typeof item === "string")
    default:
      return false
  }
}

/** Throws when a contract entry's `params` block is malformed; the contract check and tests call it. */
const assertValidParamsDeclaration = (entry) => {
  if (entry.params === undefined) return
  if (entry.args !== "object") throw new Error(`${entry.command}: params require args "object"`)
  if (!entry.params || typeof entry.params !== "object" || Array.isArray(entry.params)) {
    throw new Error(`${entry.command}: params must be an object`)
  }
  for (const [name, schema] of Object.entries(entry.params)) {
    if (!schema || !PARAM_TYPES.has(schema.type)) throw new Error(`${entry.command}.${name}: unknown type`)
    if (schema.enum !== undefined && (schema.type !== "string" || !Array.isArray(schema.enum))) {
      throw new Error(`${entry.command}.${name}: enum is only valid for strings`)
    }
    if (schema.maxLength !== undefined && !(Number.isInteger(schema.maxLength) && schema.maxLength >= 0)) {
      throw new Error(`${entry.command}.${name}: maxLength must be a non-negative integer`)
    }
    if (schema.maxLength !== undefined && !["string", "array", "string[]"].includes(schema.type)) {
      throw new Error(`${entry.command}.${name}: maxLength applies only to strings and arrays`)
    }
  }
}

const validateCommandArgs = (entry, args) => {
  if (!entry || entry.params === undefined) return { ok: true }
  const value = args ?? {}
  if (!matchesType("object", value)) return { ok: false, error: `expected an object, got ${describe(value)}` }
  for (const [name, schema] of Object.entries(entry.params)) {
    const present = Object.prototype.hasOwnProperty.call(value, name) && value[name] !== undefined
    if (!present) {
      if (schema.optional) continue
      return { ok: false, error: `${name} is required` }
    }
    const field = value[name]
    if (field === null) {
      if (schema.nullable) continue
      return { ok: false, error: `${name} must not be null` }
    }
    if (!matchesType(schema.type, field)) {
      return { ok: false, error: `${name} must be ${schema.type}, got ${describe(field)}` }
    }
    if (schema.maxLength !== undefined && field.length > schema.maxLength) {
      return { ok: false, error: `${name} is longer than ${schema.maxLength}` }
    }
    if (schema.enum !== undefined && !schema.enum.includes(field)) {
      return { ok: false, error: `${name} must be one of ${schema.enum.join(", ")}` }
    }
  }
  return { ok: true }
}

const indexContract = (contract) => {
  const byName = new Map()
  for (const entry of contract?.commands ?? []) {
    assertValidParamsDeclaration(entry)
    byName.set(entry.command, entry)
  }
  return byName
}

module.exports = {
  PARAM_TYPES,
  assertValidParamsDeclaration,
  indexContract,
  validateCommandArgs,
}
