/**
 * A simple form for a page tool's input schema. Only a flat object of primitive properties gets fields; anything else is
 * edited as JSON. Values are converted by the declared type and never evaluated.
 */
export type ToolField =
  | { name: string; kind: "string" | "number" | "integer" | "boolean"; required: boolean; description?: string }
  | { name: string; kind: "enum"; options: string[]; required: boolean; description?: string }

export type ToolForm = { kind: "fields"; fields: ToolField[] } | { kind: "json" }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

export function toolForm(schema: unknown): ToolForm {
  if (schema === undefined) return { kind: "fields", fields: [] }
  if (!isRecord(schema) || schema.type !== "object" || !isRecord(schema.properties)) return { kind: "json" }
  const required = new Set(Array.isArray(schema.required) ? schema.required.filter((key) => typeof key === "string") : [])
  const fields: ToolField[] = []
  for (const [name, property] of Object.entries(schema.properties).slice(0, 24)) {
    if (!isRecord(property)) return { kind: "json" }
    const description = typeof property.description === "string" ? property.description.slice(0, 300) : undefined
    if (Array.isArray(property.enum) && property.enum.every((option) => typeof option === "string")) {
      fields.push({ name, kind: "enum", options: property.enum as string[], required: required.has(name), description })
    } else if (["string", "number", "integer", "boolean"].includes(property.type as string)) {
      fields.push({ name, kind: property.type as "string" | "number" | "integer" | "boolean", required: required.has(name), description })
    } else {
      return { kind: "json" }
    }
  }
  return { kind: "fields", fields }
}

/** Builds the tool input from field text, or returns the name of the first field that is missing or not a valid value. */
export function toolInput(
  fields: readonly ToolField[],
  values: Readonly<Record<string, string>>,
): { ok: true; input: Record<string, unknown> } | { ok: false; field: string } {
  const input: Record<string, unknown> = {}
  for (const field of fields) {
    const raw = (values[field.name] ?? "").trim()
    if (!raw) {
      if (field.required) return { ok: false, field: field.name }
      continue
    }
    if (field.kind === "number" || field.kind === "integer") {
      const value = Number(raw)
      if (!Number.isFinite(value) || (field.kind === "integer" && !Number.isInteger(value))) return { ok: false, field: field.name }
      input[field.name] = value
    } else if (field.kind === "boolean") {
      if (raw !== "true" && raw !== "false") return { ok: false, field: field.name }
      input[field.name] = raw === "true"
    } else if (field.kind === "enum") {
      if (!field.options.includes(raw)) return { ok: false, field: field.name }
      input[field.name] = raw
    } else {
      input[field.name] = raw
    }
  }
  return { ok: true, input }
}
