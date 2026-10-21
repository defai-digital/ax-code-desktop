import { redactWebMcpReport, webMcpDisplayKey, webMcpDisplaySchema } from "../../../../shared/webmcp-redaction.mjs"

/** Advisory property changes only; compare original values, but never return them for display. */
export function propertyDiff(before: unknown, after: unknown) {
  const read = (schema: unknown) => {
    const object = (schema ?? {}) as { properties?: Record<string, unknown>; required?: string[] }
    return { properties: object.properties ?? {}, required: Array.isArray(object.required) ? object.required : [] }
  }
  const a = read(before), b = read(after)
  // Redact complete schemas before moving properties into generic before/after containers.
  const safeA = read(redactWebMcpReport(before)), safeB = read(redactWebMcpReport(after))
  const display = (schema: unknown, required: boolean) =>
    schema && typeof schema === "object" ? webMcpDisplaySchema({ ...schema, required }) : schema
  return [...new Set([...Object.keys(a.properties), ...Object.keys(b.properties)])].flatMap((name) => {
    const left = a.properties[name] as Record<string, unknown> | undefined
    const right = b.properties[name] as Record<string, unknown> | undefined
    const changes = ["type", "enum", "description", "minimum", "maximum", "minLength", "maxLength", "pattern", "format", "default"]
      .filter((key) => JSON.stringify(left?.[key]) !== JSON.stringify(right?.[key]))
    if (a.required.includes(name) !== b.required.includes(name)) changes.push("required")
    return !left || !right || changes.length ? [{
      property: webMcpDisplayKey(name),
      change: !left ? "added" : !right ? "removed" : "changed",
      fields: changes,
      before: display(safeA.properties[name], a.required.includes(name)),
      after: display(safeB.properties[name], b.required.includes(name)),
    }] : []
  })
}
