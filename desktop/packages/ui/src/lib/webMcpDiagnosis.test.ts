import { describe, expect, test } from "vitest"
import {
  diagnoseWebMcpInput,
  webMcpDefinitionChanged,
  webMcpDefinitionsDiffer,
  webMcpRegressionExport,
} from "./webMcpDiagnosis"

const schema = {
  type: "object",
  properties: {
    title: { type: "string", minLength: 2, maxLength: 4 },
    count: { type: "integer", minimum: 1, maximum: 3 },
    ratio: { type: "number", minimum: 0, maximum: 1 },
    mode: { type: "string", enum: ["a", "b"] },
    on: { type: "boolean" },
    labels: { type: "array" },
  },
  required: ["title", "labels"],
}

describe("diagnoseWebMcpInput", () => {
  test("names the failing property, rule and value kind, including a missing opaque property", () => {
    expect(diagnoseWebMcpInput(schema, {})).toEqual({
      status: "checked",
      findings: [
        { property: "labels", rule: "required", valueKind: "absent" },
        { property: "title", rule: "required", valueKind: "absent" },
      ],
    })
    // Mutation probe: the type failure must name `title`, not a stand-in property.
    expect(diagnoseWebMcpInput(schema, { title: 1, labels: [] })).toEqual({
      status: "checked",
      findings: [{ property: "title", rule: "type", valueKind: "integer", expected: "string" }],
    })
    const nulled = diagnoseWebMcpInput(schema, { title: null, labels: [] })
    expect(nulled).toMatchObject({
      status: "checked",
      findings: [{ property: "title", rule: "type", valueKind: "null", expected: "string" }],
    })
  })

  test("checks enum, min, max and length, and a wrong type suppresses range checks", () => {
    expect(diagnoseWebMcpInput(schema, { title: "a", labels: [], count: 0, ratio: 2, mode: "z" })).toEqual({
      status: "checked",
      findings: [
        { property: "title", rule: "minLength", valueKind: "string" },
        { property: "count", rule: "minimum", valueKind: "integer" },
        { property: "ratio", rule: "maximum", valueKind: "integer" },
        { property: "mode", rule: "enum", valueKind: "string" },
      ],
    })
    expect(diagnoseWebMcpInput(schema, { title: "abcde", labels: [], count: 4 })).toMatchObject({
      findings: [
        { property: "title", rule: "maxLength", valueKind: "string" },
        { property: "count", rule: "maximum", valueKind: "integer" },
      ],
    })
    expect(diagnoseWebMcpInput(schema, { title: "😀", labels: [] })).toMatchObject({
      findings: [{ property: "title", rule: "minLength", valueKind: "string" }],
    })
    expect(diagnoseWebMcpInput(schema, { title: "😀😀", labels: [] })).toEqual({ status: "checked", findings: [] })
    const fractional = diagnoseWebMcpInput(schema, { title: "ok", labels: [], count: 1.5 })
    expect(fractional).toEqual({
      status: "checked",
      findings: [{ property: "count", rule: "type", valueKind: "number", expected: "integer" }],
    })
    expect(diagnoseWebMcpInput(schema, { title: "ok", labels: [], on: "yes" })).toMatchObject({
      findings: [{ property: "on", rule: "type", valueKind: "string", expected: "boolean" }],
    })
  })

  test("an empty object schema is checked, and a missing or non-object schema is not", () => {
    expect(diagnoseWebMcpInput(undefined, {})).toEqual({ status: "unchecked", reason: "no-schema" })
    expect(diagnoseWebMcpInput({ type: "string" }, {})).toEqual({ status: "unchecked", reason: "unsupported-schema" })
    expect(diagnoseWebMcpInput({ type: "object", properties: {} }, {})).toEqual({ status: "checked", findings: [] })
  })
})

describe("definition identity", () => {
  test("a different known digest is a difference, and an unknown digest is not", () => {
    const left = "a".repeat(8)
    const right = "b".repeat(8)
    // Mutation probe: this flag must stay false when either digest is missing.
    expect(webMcpDefinitionsDiffer(left, right)).toBe(true)
    expect(webMcpDefinitionsDiffer(left, left)).toBe(false)
    expect(webMcpDefinitionsDiffer(null, right)).toBe(false)
    expect(webMcpDefinitionsDiffer(left, "")).toBe(false)
    expect(webMcpDefinitionsDiffer(undefined, undefined)).toBe(false)
    expect(webMcpDefinitionChanged(left, right)).toBe(true)
    expect(webMcpDefinitionChanged(left, left)).toBe(false)
    expect(webMcpDefinitionChanged(null, right)).toBe(false)
    expect(webMcpDefinitionChanged("", right)).toBe(false)
  })
})

describe("webMcpRegressionExport", () => {
  test("calls executeTool with a JSON string and offers the equivalent --run argument", () => {
    const exported = webMcpRegressionExport({
      tool: "add_task",
      input: { title: "Ship the beta" },
      outcome: "completed",
    })
    expect(exported?.snippet).toContain(
      'const tool = (await document.modelContext.getTools()).find((candidate) => candidate.name === "add_task")',
    )
    expect(exported?.snippet).toContain(
      'const result = JSON.parse(await document.modelContext.executeTool(tool, JSON.stringify({"title":"Ship the beta"})))',
    )
    expect(exported?.snippet).toContain('if (outcome !== "completed") throw new Error("expected outcome " + "completed")')
    expect(exported?.runArgument).toBe(`--run 'add_task={"title":"Ship the beta"}'`)
    const spec = exported!.runArgument.slice("--run ".length)
    expect(spec.startsWith("'") && spec.endsWith("'")).toBe(true)
    const inner = spec.slice(1, -1).replaceAll("'\\''", "'")
    const split = inner.indexOf("=")
    expect(inner.slice(0, split)).toBe("add_task")
    expect(JSON.parse(inner.slice(split + 1))).toEqual({ title: "Ship the beta" })

    const quoted = webMcpRegressionExport({ tool: "add_task", input: { title: "it's" }, outcome: "uncertain" })
    expect(quoted?.runArgument).toBe(`--run 'add_task={"title":"it'\\''s"}'`)
    expect(quoted?.snippet).toContain('outcome !== "uncertain"')
    const quotedInner = quoted!.runArgument.slice("--run '".length, -1).replaceAll("'\\''", "'")
    expect(JSON.parse(quotedInner.slice(quotedInner.indexOf("=") + 1))).toEqual({ title: "it's" })

    expect(webMcpRegressionExport({ tool: "", input: { title: "x" }, outcome: "completed" })).toBeNull()
    expect(webMcpRegressionExport({ tool: "add_task", input: [] as never, outcome: "completed" })).toBeNull()
  })
})
