/** Advisory property changes only; the runtime remains the validator. */
export function propertyDiff(before: unknown, after: unknown) {
  const read = (schema: unknown) => {
    const object = (schema ?? {}) as { properties?: Record<string, unknown>; required?: string[] }
    return { properties: object.properties ?? {}, required: Array.isArray(object.required) ? object.required : [] }
  }
  const a = read(before), b = read(after)
  return [...new Set([...Object.keys(a.properties), ...Object.keys(b.properties)])].flatMap((name) => {
    const left = a.properties[name] as Record<string, unknown> | undefined
    const right = b.properties[name] as Record<string, unknown> | undefined
    const changes = ["type", "enum", "description"].filter((key) => JSON.stringify(left?.[key]) !== JSON.stringify(right?.[key]))
    if (a.required.includes(name) !== b.required.includes(name)) changes.push("required")
    return !left || !right || changes.length ? [{ property: name, change: !left ? "added" : !right ? "removed" : "changed", fields: changes,
      before: { ...left, required: a.required.includes(name) }, after: { ...right, required: b.required.includes(name) } }] : []
  })
}
