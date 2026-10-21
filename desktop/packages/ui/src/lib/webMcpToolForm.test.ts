import { describe, expect, test } from "vitest"
import { draftFromRecordedInput, toolForm, toolInput, toolInputWarnings } from "./webMcpToolForm"

const fields = (properties: Record<string, unknown>, required: string[] = []) => {
  const form = toolForm({ type: "object", properties, required })
  if (form.kind !== "fields") throw new Error("expected fields")
  return form.fields
}

describe("WebMCP tool form", () => {
  test("all 30 properties become fields including property 25 and the final property", () => {
    const properties = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`p${i + 1}`, { type: "string" }]))
    const all = fields(properties)
    expect(all.map((field) => field.name)).toEqual(Object.keys(properties))
    expect(toolInput(all, { p25: "  lead  ", p30: "last" })).toEqual({
      ok: true,
      input: { p25: "  lead  ", p30: "last" },
    })
  })

  test("nested, composed, unknown and excessive schemas use the complete JSON editor with a reason", () => {
    expect(toolForm({ type: "object", properties: { labels: { type: "array" } } })).toEqual({
      kind: "json",
      reason: "complex",
    })
    expect(toolForm({ type: "object", properties: {}, anyOf: [{}] })).toEqual({ kind: "json", reason: "complex" })
    expect(toolForm("not a schema")).toEqual({ kind: "json", reason: "complex" })
    expect(
      toolForm({
        type: "object",
        properties: Object.fromEntries(Array.from({ length: 129 }, (_, i) => [i, { type: "string" }])),
      }),
    ).toEqual({ kind: "json", reason: "large" })
    expect(toolForm(undefined)).toEqual({ kind: "fields", fields: [] })
  })

  test("padded strings round-trip exactly; absent, explicit empty, zero and false are distinct", () => {
    const all = fields({
      text: { type: "string" },
      empty: { type: "string" },
      omitted: { type: "string" },
      zero: { type: "number" },
      off: { type: "boolean" },
    })
    expect(
      toolInput(all, { text: "  lead  ", empty: "", omitted: "", zero: "0", off: "false" }, { empty: true }),
    ).toEqual({ ok: true, input: { text: "  lead  ", empty: "", zero: 0, off: false } })
    expect(toolInput(fields({ x: { type: "string" } }, ["x"]), { x: "" }, { x: true })).toEqual({
      ok: true,
      input: { x: "" },
    })
    expect(toolInput(fields({ x: { enum: ["", " x "] } }), { x: " x " })).toEqual({ ok: true, input: { x: " x " } })
  })

  test("conversion failures name the field and constraint", () => {
    const all = fields({ count: { type: "integer" }, on: { type: "boolean" } }, ["count"])
    expect(toolInput(all, {})).toEqual({ ok: false, field: "count", constraint: "required" })
    expect(toolInput(all, { count: "2.5" })).toEqual({ ok: false, field: "count", constraint: "integer" })
    expect(toolInput(all, { count: "1", on: "no" })).toEqual({ ok: false, field: "on", constraint: "boolean" })
    expect(toolInput(all, { count: " " })).toEqual({ ok: false, field: "count", constraint: "integer" })
  })

  test("declared hints are preserved and simple checks stay advisory, with Unicode code point lengths", () => {
    const all = fields({
      n: { type: "number", minimum: 0, maximum: 10, default: 5 },
      s: { type: "string", minLength: 2, maxLength: 3, format: "email" },
      e: { type: "string", enum: ["x", ""] },
    })
    expect(all[0].constraints).toEqual({ minimum: 0, maximum: 10, default: 5 })
    expect(all[1].constraints).toEqual({ minLength: 2, maxLength: 3, format: "email" })
    expect(toolInputWarnings(all, { n: -1, s: "a", e: "z" })).toEqual([
      { field: "n", constraint: "minimum" },
      { field: "s", constraint: "minLength" },
      { field: "e", constraint: "enum" },
    ])
    expect(toolInputWarnings(all, { n: 11, s: "abcd" })).toEqual([
      { field: "n", constraint: "maximum" },
      { field: "s", constraint: "maxLength" },
    ])
    expect(toolInputWarnings(all, { s: "😀😀", e: "" })).toEqual([])
    expect(toolInputWarnings(all, {})).toEqual([])
    expect(toolInput(all, { e: "z" })).toEqual({ ok: true, input: { e: "z" } })
  })

  test("untrusted property names remain own input properties", () => {
    const all = fields(JSON.parse('{"__proto__":{"type":"string"}}'))
    const built = toolInput(all, JSON.parse('{"__proto__":"data"}'))
    expect(built).toEqual({ ok: true, input: JSON.parse('{"__proto__":"data"}') })
  })

  test("a recorded object reloads into fields, and a value the fields cannot show stays JSON", () => {
    const schema = {
      type: "object",
      properties: { title: { type: "string" }, n: { type: "integer" }, ok: { type: "boolean" } },
      required: ["title"],
    }
    const input = { title: "", n: 2, ok: false }
    expect(draftFromRecordedInput(schema, input)).toEqual({
      values: { title: "", n: "2", ok: "false" },
      sendEmpty: { title: true },
      json: JSON.stringify(input, null, 2),
      jsonMode: false,
    })
    expect(draftFromRecordedInput(schema, { title: "a", extra: 1 }).jsonMode).toBe(true)
    expect(draftFromRecordedInput(schema, { n: 1.5 }).jsonMode).toBe(true)
    expect(draftFromRecordedInput({ type: "object", properties: { labels: { type: "array" } } }, {}).jsonMode).toBe(true)
  })
})
