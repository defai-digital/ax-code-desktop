import { redactWebMcpText } from "../../../../shared/webmcp-redaction.mjs"
/** Primitive fields are an input aid, not an authoritative schema validator. */
export type ToolField = {
  name: string
  kind: "string" | "number" | "integer" | "boolean" | "enum"
  options?: string[]
  required: boolean
  description?: string
  constraints?: Record<string, unknown>
}

export type ToolForm = { kind: "fields"; fields: ToolField[] } | { kind: "json"; reason: "complex" | "large" }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)
const constraintNames = ["minimum", "maximum", "minLength", "maxLength", "enum", "format", "default"] as const
const compositionKeys = ["oneOf", "anyOf", "allOf", "$ref", "if", "not"] as const

/** One primitive property. Null when the property is nested or composed, so the caller can decide what to do. */
function readToolField(name: string, property: unknown, required: boolean): ToolField | null {
  if (!isRecord(property)) return null
  if (compositionKeys.some((key) => key in property)) return null
  const description =
    typeof property.description === "string" ? redactWebMcpText(property.description).slice(0, 300) : undefined
  const constraints = Object.fromEntries(
    constraintNames.filter((key) => key in property).map((key) => [key, property[key]]),
  )
  const common = {
    name,
    required,
    description,
    ...(Object.keys(constraints).length ? { constraints } : {}),
  }
  if (
    Array.isArray(property.enum) &&
    property.enum.every((option) => typeof option === "string") &&
    (property.type === undefined || property.type === "string")
  ) {
    return { ...common, kind: "enum", options: property.enum as string[] }
  }
  if (
    property.type === "string" ||
    property.type === "number" ||
    property.type === "integer" ||
    property.type === "boolean"
  ) {
    return { ...common, kind: property.type }
  }
  return null
}

function requiredNames(schema: Record<string, unknown>): Set<string> {
  return new Set(Array.isArray(schema.required) ? schema.required.filter((key) => typeof key === "string") : [])
}

export function toolForm(schema: unknown): ToolForm {
  if (schema === undefined) return { kind: "fields", fields: [] }
  if (!isRecord(schema) || schema.type !== "object" || !isRecord(schema.properties))
    return { kind: "json", reason: "complex" }
  const schemaProperties = schema.properties
  const properties = Object.entries(schemaProperties)
  if (properties.length > 128) return { kind: "json", reason: "large" }
  // Composition can change the meaning of otherwise simple properties. Keep the whole input editable.
  if (compositionKeys.some((key) => key in schema)) return { kind: "json", reason: "complex" }
  const required = requiredNames(schema)
  if ([...required].some((key) => !Object.hasOwn(schemaProperties, key))) return { kind: "json", reason: "complex" }
  const fields: ToolField[] = []
  for (const [name, property] of properties) {
    const field = readToolField(name, property, required.has(name))
    if (!field) return { kind: "json", reason: "complex" }
    fields.push(field)
  }
  return { kind: "fields", fields }
}

/**
 * Primitive properties an advisory diagnosis can name. One nested property does not hide the others, and root
 * composition does not hide a simple sibling. At most 128 properties, matching the field form.
 */
export function diagnosisFields(schema: unknown): ToolField[] {
  if (!isRecord(schema) || schema.type !== "object" || !isRecord(schema.properties)) return []
  const required = requiredNames(schema)
  const fields: ToolField[] = []
  for (const [name, property] of Object.entries(schema.properties).slice(0, 128)) {
    const field = readToolField(name, property, required.has(name))
    if (field) fields.push(field)
  }
  return fields
}

/** Required names whose schema is not a primitive field, so a missing value can still be named. */
export function diagnosisOpaqueRequired(schema: unknown, fields: readonly ToolField[]): string[] {
  if (!isRecord(schema) || !isRecord(schema.properties)) return []
  const covered = new Set(fields.map((field) => field.name))
  const properties = schema.properties
  return [...requiredNames(schema)].filter((name) => Object.hasOwn(properties, name) && !covered.has(name))
}

/** Empty text omits a field unless the person explicitly chooses to send an empty string. */
export function toolInput(
  fields: readonly ToolField[],
  values: Readonly<Record<string, string>>,
  sendEmpty: Readonly<Record<string, boolean>> = {},
): { ok: true; input: Record<string, unknown> } | { ok: false; field: string; constraint: string } {
  const input: Record<string, unknown> = Object.create(null)
  for (const field of fields) {
    const raw = Object.hasOwn(values, field.name) ? values[field.name] : ""
    if (raw === "" && !((field.kind === "string" || field.kind === "enum") && sendEmpty[field.name] === true)) {
      if (field.required) return { ok: false, field: field.name, constraint: "required" }
      continue
    }
    if (field.kind === "number" || field.kind === "integer") {
      const value = raw.trim() === "" ? NaN : Number(raw)
      if (!Number.isFinite(value) || (field.kind === "integer" && !Number.isInteger(value)))
        return { ok: false, field: field.name, constraint: field.kind }
      input[field.name] = value
    } else if (field.kind === "boolean") {
      if (raw !== "true" && raw !== "false") return { ok: false, field: field.name, constraint: "boolean" }
      input[field.name] = raw === "true"
    } else input[field.name] = raw
  }
  return { ok: true, input }
}

/** Check only simple declared constraints. Warnings never prevent a send; the page remains the authority. */
export function toolInputWarnings(fields: readonly ToolField[], input: Record<string, unknown>) {
  const warnings: { field: string; constraint: string }[] = []
  for (const field of fields) {
    if (!Object.hasOwn(input, field.name)) continue
    const value = input[field.name]
    for (const [constraint, bound] of Object.entries(field.constraints ?? {})) {
      const violated =
        (constraint === "minimum" && typeof value === "number" && typeof bound === "number" && value < bound) ||
        (constraint === "maximum" && typeof value === "number" && typeof bound === "number" && value > bound) ||
        (constraint === "minLength" &&
          typeof value === "string" &&
          typeof bound === "number" &&
          [...value].length < bound) ||
        (constraint === "maxLength" &&
          typeof value === "string" &&
          typeof bound === "number" &&
          [...value].length > bound) ||
        (constraint === "enum" && Array.isArray(bound) && !bound.some((option) => Object.is(value, option)))
      if (violated) warnings.push({ field: field.name, constraint })
    }
  }
  return warnings
}

/** Load a recorded object back into the field form. A value the fields cannot show stays in the JSON editor. */
export function draftFromRecordedInput(
  schema: unknown,
  input: Record<string, unknown>,
): { values: Record<string, string>; sendEmpty: Record<string, boolean>; json: string; jsonMode: boolean } {
  const json = JSON.stringify(input, null, 2)
  const form = toolForm(schema)
  const empty = { values: {} as Record<string, string>, sendEmpty: {} as Record<string, boolean>, json, jsonMode: true }
  if (form.kind !== "fields") return empty
  const values: Record<string, string> = {}
  const sendEmpty: Record<string, boolean> = {}
  for (const [key, value] of Object.entries(input)) {
    const field = form.fields.find((item) => item.name === key)
    if (!field) return empty
    if (field.kind === "string" || field.kind === "enum") {
      if (typeof value !== "string") return empty
      values[key] = value
      if (value === "") sendEmpty[key] = true
    } else if (field.kind === "boolean") {
      if (typeof value !== "boolean") return empty
      values[key] = value ? "true" : "false"
    } else if (
      typeof value === "number" &&
      Number.isFinite(value) &&
      (field.kind === "number" || Number.isInteger(value))
    ) {
      values[key] = String(value)
    } else return empty
  }
  return { values, sendEmpty, json, jsonMode: false }
}
