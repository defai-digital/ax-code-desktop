import { describe, expect, test } from "vitest"
import { desktopWebMcpResultOutcome, readWebMcpInvokeInput } from "./toolHelpers"
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
  test("a copied error regression catches rejection but still detects a changed outcome", async () => {
    const context = {
      getTools: async () => [{ name: "echo" }],
      executeTool: async () => {
        throw new Error("unchanged tool error")
      },
    }
    for (const outcome of ["application-error", "completed"]) {
      const exported = webMcpRegressionExport({ tool: "echo", input: {}, outcome })!
      const execution = new AsyncFunction("document", exported.snippet)({ modelContext: context })
      if (outcome === "application-error") await expect(execution).resolves.toBeUndefined()
      else await expect(execution).rejects.toThrow("expected outcome")
    }
  })
  test("untrusted tool names and arguments remain data in the exported program", async () => {
    const toolName = 'echo"); injected(); //\n</script><script>injected()</script>'
    const input = { text: '"}); injected(); //', nested: ["` ${injected()} "] }
    const exported = webMcpRegressionExport({ tool: toolName, input, outcome: "completed" })!
    let injected = false
    let received: unknown
    const tool = { name: toolName }
    await new AsyncFunction("document", "injected", exported.snippet)(
      { modelContext: {
        getTools: async () => [tool],
        executeTool: async (selected: unknown, argumentsJson: string) => {
          expect(selected).toBe(tool)
          received = JSON.parse(argumentsJson)
          return "{}"
        },
      } },
      () => { injected = true },
    )
    expect(injected).toBe(false)
    expect(received).toEqual(input)
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
      input: {
        user: "ada",
        password: "hunter22",
        profile: { apiKey: "sk-live-abc" },
        note: "ghp_abcdefghijklmnopqrstuvwxyz0123456789",
      },
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

test("diagnosis never compares a redacted password with the schema minimum", () => {
  const receipt = readWebMcpInvokeInput({ arguments: { password: "a-valid-long-password", count: "wrong" } })
  expect(diagnoseWebMcpInput({ type: "object", properties: { password: { type: "string", minLength: 12 }, count: { type: "integer" } } }, receipt.input!)).toEqual({
    status: "checked", findings: [{ property: "count", rule: "type", valueKind: "string", expected: "integer" }], uncheckable: ["password"],
  })
})

test("regression snippet and checker argument replace nested JSON secrets", async () => {
  const exported = webMcpRegressionExport({ tool: "echo", input: { payload: '{"password":"AUDIT_FAKE_PASSWORD"}' }, outcome: "completed" })!
  expect(exported.snippet).not.toContain("AUDIT_FAKE_PASSWORD")
  expect(exported.runArgument).not.toContain("AUDIT_FAKE_PASSWORD")
  await executeExport(exported.snippet, {}, (input) => expect(input).toEqual({ payload: '{"password":"<fill in>"}' }))
})

test("every shared manual outcome either has an executable classifier assertion or no export", async () => {
  const { createRequire } = await import("node:module")
  const { MANUAL_TOOL_OUTCOMES, manualToolResult, manualToolFailure } = createRequire(import.meta.url)(
    "../../../../shared/webmcp-manual-outcome.cjs",
  )
  const outputs: Record<string, unknown> = {
    completed: { value: 1 },
    "application-error": { isError: true },
    timeout: { status: "timeout" },
    cancelled: { status: "cancelled" },
  }
  for (const outcome of [...MANUAL_TOOL_OUTCOMES, "running", "future-outcome"]) {
    const exported = webMcpRegressionExport({ tool: "echo", input: {}, outcome })
    if (Object.hasOwn(outputs, outcome)) {
      expect(manualToolResult({ output: outputs[outcome] }).outcome).toBe(outcome)
      expect(exported).not.toBeNull()
      await executeExport(exported!.snippet, outputs[outcome])
    } else expect(exported, outcome).toBeNull()
  }
  expect(
    webMcpRegressionExport({
      tool: "echo",
      input: {},
      outcome: manualToolFailure({ outcome: "failed", reason: "result-too-large" }).outcome,
    }),
  ).toBeNull()
})

test("every embedded credential shape is removed from executable exports and checker arguments", async () => {
  const { credentialTextCases, secret } = await import("../../../../shared/testing/webmcp-redaction-cases.mjs")
  for (const text of credentialTextCases) {
    const exported = webMcpRegressionExport({ tool: "echo", input: { message: text }, outcome: "completed" })!
    expect(exported.snippet).not.toContain(secret)
    expect(exported.runArgument).not.toContain(secret)
    expect(webMcpRegressionExport({ tool: text, input: {}, outcome: "completed" })).toBeNull()
    await executeExport(exported.snippet, {}, (input) => expect(JSON.stringify(input)).not.toContain(secret))
  }
})
