import { describe, expect, test } from "vitest"
import { toolForm, toolInput } from "./webMcpToolForm"

describe("WebMCP tool form", () => {
  test("a flat object of primitives becomes fields; anything nested or unknown falls back to JSON", () => {
    const form = toolForm({
      type: "object",
      properties: {
        title: { type: "string", description: "Short title" },
        priority: { type: "string", enum: ["low", "high"] },
        count: { type: "integer" },
        urgent: { type: "boolean" },
      },
      required: ["title", "priority"],
    })
    expect(form).toEqual({
      kind: "fields",
      fields: [
        { name: "title", kind: "string", required: true, description: "Short title" },
        { name: "priority", kind: "enum", options: ["low", "high"], required: true, description: undefined },
        { name: "count", kind: "integer", required: false, description: undefined },
        { name: "urgent", kind: "boolean", required: false, description: undefined },
      ],
    })
    expect(toolForm({ type: "object", properties: { labels: { type: "array", items: { type: "string" } } } })).toEqual({
      kind: "json",
    })
    expect(toolForm("not a schema")).toEqual({ kind: "json" })
    expect(toolForm(undefined)).toEqual({ kind: "fields", fields: [] })
  })

  test("values convert by declared type, and an invalid or missing required value names its field", () => {
    const form = toolForm({
      type: "object",
      properties: { a: { type: "integer" }, b: { type: "number" }, on: { type: "boolean" }, p: { enum: ["x"] } },
      required: ["a"],
    })
    if (form.kind !== "fields") throw new Error("expected fields")
    expect(toolInput(form.fields, { a: "2", b: "1.5", on: "true", p: "x" })).toEqual({
      ok: true,
      input: { a: 2, b: 1.5, on: true, p: "x" },
    })
    expect(toolInput(form.fields, { a: "" })).toEqual({ ok: false, field: "a" })
    expect(toolInput(form.fields, { a: "2.5" })).toEqual({ ok: false, field: "a" })
    expect(toolInput(form.fields, { a: "1", p: "y" })).toEqual({ ok: false, field: "p" })
    expect(toolInput(form.fields, { a: "1", b: "abc" })).toEqual({ ok: false, field: "b" })
  })
})
