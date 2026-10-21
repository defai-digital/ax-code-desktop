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

export function toolForm(schema: unknown): ToolForm {
  if (schema === undefined) return { kind: "fields", fields: [] }
  if (!isRecord(schema) || schema.type !== "object" || !isRecord(schema.properties))
    return { kind: "json", reason: "complex" }
  const schemaProperties = schema.properties
  const properties = Object.entries(schemaProperties)
  if (properties.length > 128) return { kind: "json", reason: "large" }
  // Composition can change the meaning of otherwise simple properties. Keep the whole input editable.
  if (["oneOf", "anyOf", "allOf", "$ref", "if", "not"].some((key) => key in schema))
    return { kind: "json", reason: "complex" }
  const required = new Set(
    Array.isArray(schema.required) ? schema.required.filter((key) => typeof key === "string") : [],
  )
  if ([...required].some((key) => !Object.hasOwn(schemaProperties, key))) return { kind: "json", reason: "complex" }
  const fields: ToolField[] = []
  for (const [name, property] of properties) {
    if (!isRecord(property)) return { kind: "json", reason: "complex" }
    if (["oneOf", "anyOf", "allOf", "$ref", "if", "not"].some((key) => key in property))
      return { kind: "json", reason: "complex" }
    const description = typeof property.description === "string" ? property.description.slice(0, 300) : undefined
    const constraints = Object.fromEntries(
      constraintNames.filter((key) => key in property).map((key) => [key, property[key]]),
    )
    const common = {
      name,
      required: required.has(name),
      description,
      ...(Object.keys(constraints).length ? { constraints } : {}),
    }
    if (
      Array.isArray(property.enum) &&
      property.enum.every((option) => typeof option === "string") &&
      (property.type === undefined || property.type === "string")
    ) {
      fields.push({ ...common, kind: "enum", options: property.enum as string[] })
    } else if (["string", "number", "integer", "boolean"].includes(property.type as string)) {
      fields.push({ ...common, kind: property.type as ToolField["kind"] })
    } else return { kind: "json", reason: "complex" }
  }
  return { kind: "fields", fields }
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
