import { describe, expect, test } from "vitest"
import { desktopWebMcpResultOutcome } from "./toolHelpers"
import {
  diagnoseWebMcpInput,
  webMcpDefinitionChanged,
  webMcpDefinitionsDiffer,
  webMcpRegressionExport,
} from "./webMcpDiagnosis"

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor

async function executeExport(snippet: string, output: unknown, onInput?: (input: unknown) => void) {
  const tool = { name: "echo" }
  await new AsyncFunction("document", snippet)({
    modelContext: {
      getTools: async () => [tool],
      executeTool: async (selected: unknown, input: string) => {
        expect(selected).toBe(tool)
        onInput?.(JSON.parse(input))
        return output
      },
    },
  })
}

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
  test.each([
    { status: "failed" },
    { status: " ERROR " },
    { errorText: "Invalid title" },
    { status: " Timeout ", isError: true },
    { status: " Cancelled " },
    { status: "aborted" },
    { untrusted: true, result: { status: "failed" } },
    { error: { field: "title" } },
    { error: {} },
    { error: [] },
    { error: "   " },
    { error: false },
    { isError: true },
    { ok: false },
    { value: 3 },
    null,
    "plain text",
  ])("executes the copied test with the same outcome as Try it for %j", async (value) => {
    const output = typeof value === "string" ? value : JSON.stringify(value)
    const outcome = desktopWebMcpResultOutcome({ status: "completed", output })!
    const exported = webMcpRegressionExport({ tool: "echo", input: {}, outcome })!
    await executeExport(exported.snippet, output)
    const changed = webMcpRegressionExport({
      tool: "echo",
      input: {},
      outcome: outcome === "completed" ? "application-error" : "completed",
    })!
    await expect(executeExport(changed.snippet, output)).rejects.toThrow("expected outcome")
  })
  test("calls executeTool with a JSON string and offers the equivalent --run argument", async () => {
    const exported = webMcpRegressionExport({
      tool: "echo",
      input: { title: "Ship the beta" },
      outcome: "completed",
    })
    await executeExport(exported!.snippet, "{}", (input) => expect(input).toEqual({ title: "Ship the beta" }))
    expect(exported?.runArgument).toBe(`--run 'echo={"title":"Ship the beta"}'`)
    const spec = exported!.runArgument.slice("--run ".length)
    expect(spec.startsWith("'") && spec.endsWith("'")).toBe(true)
    const inner = spec.slice(1, -1).replaceAll("'\\''", "'")
    const split = inner.indexOf("=")
    expect(inner.slice(0, split)).toBe("echo")
    expect(JSON.parse(inner.slice(split + 1))).toEqual({ title: "Ship the beta" })

    const quoted = webMcpRegressionExport({ tool: "echo", input: { title: "it's" }, outcome: "completed" })
    expect(quoted?.runArgument).toBe(`--run 'echo={"title":"it'\\''s"}'`)
    await executeExport(quoted!.snippet, "{}", (input) => expect(input).toEqual({ title: "it's" }))
    const quotedInner = quoted!.runArgument.slice("--run '".length, -1).replaceAll("'\\''", "'")
    expect(JSON.parse(quotedInner.slice(quotedInner.indexOf("=") + 1))).toEqual({ title: "it's" })

    expect(webMcpRegressionExport({ tool: "", input: { title: "x" }, outcome: "completed" })).toBeNull()
    expect(webMcpRegressionExport({ tool: "add_task", input: [] as never, outcome: "completed" })).toBeNull()
  })
})

describe("secrets in exports", () => {
  test("replaces secrets at every array depth while preserving ordinary inputs", async () => {
    const input = {
      accounts: [{ password: "synthetic-secret", nested: [[{ apiKey: "nested-secret" }]] }],
      labels: ["keep", ["password=credential-secret", 2, false, null]],
    }
    const expected = {
      accounts: [{ password: "<fill in>", nested: [[{ apiKey: "<fill in>" }]] }],
      labels: ["keep", ["<fill in>", 2, false, null]],
    }
    const exported = webMcpRegressionExport({ tool: "echo", input, outcome: "completed" })!
    await executeExport(exported.snippet, "{}", (actual) => expect(actual).toEqual(expected))
    const spec = exported.runArgument.slice("--run '".length, -1).replaceAll("'\\''", "'")
    expect(JSON.parse(spec.slice(spec.indexOf("=") + 1))).toEqual(expected)
    expect(input.accounts[0].password).toBe("synthetic-secret")
  })
  test("a copied test and --run argument never carry a secret-named value", () => {
    const exported = webMcpRegressionExport({
      tool: "sign_in",
      input: { user: "ada", password: "hunter22", profile: { apiKey: "sk-live-abc" }, note: "ghp_abcdefghijklmnopqrstuvwxyz0123456789" },
      outcome: "completed",
    })!
    for (const text of [exported.snippet, exported.runArgument]) {
      expect(text).not.toContain("hunter22")
      expect(text).not.toContain("sk-live-abc")
      expect(text).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz0123456789")
      expect(text).toContain("<fill in>")
      expect(text).toContain("ada")
    }
  })
})
