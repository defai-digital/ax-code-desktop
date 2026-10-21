import { randomBytes } from "node:crypto"
import { runInputReceipt, toolIdentityReceipt } from "./webmcp-check-receipt.cjs"
import { redactWebMcpReport } from "../../../shared/webmcp-redaction.mjs"
import { describe, expect, test } from "vitest"
import { EXIT, checkableUrl, evaluateReport, parseCheckArgs } from "./webmcp-check-lib.mjs"

describe("webmcp:check arguments", () => {
  test("accepts https and loopback http only, without credentials", () => {
    expect(checkableUrl("https://shop.example/app")).toBe("https://shop.example/app")
    expect(checkableUrl("http://127.0.0.1:4173")).toBe("http://127.0.0.1:4173/")
    expect(checkableUrl("http://[::1]:4173")).toBe("http://[::1]:4173/")
    expect(checkableUrl("http://shop.example")).toBeNull()
    expect(checkableUrl("https://user:secret@shop.example")).toBeNull()
    expect(checkableUrl("file:///etc/passwd")).toBeNull()
  })

  test("parses runs, expected tools and options, and reports usage errors instead of throwing", () => {
    const parsed = parseCheckArgs(["--", "--url", "http://localhost:4173", "--run", 'add_task={"title":"x"}', "--run", "list_tasks", "--expect-tools", "add_task, list_tasks", "--json"])
    expect(parsed).toEqual({
      ok: true,
      options: {
        url: "http://localhost:4173/",
        runs: [{ name: "add_task", input: { title: "x" } }, { name: "list_tasks", input: {} }],
        expectTools: ["add_task", "list_tasks"],
        json: true,
        verbose: false,
        timeoutMs: 15_000,
        settleMs: 5_000,
      },
    })
    expect(parseCheckArgs([]).ok).toBe(false)
    expect(parseCheckArgs(["--url", "http://shop.example"]).ok).toBe(false)
    expect(parseCheckArgs(["--url", "https://a.test", "--run", "x={bad"]).ok).toBe(false)
    expect(parseCheckArgs(["--url", "https://a.test", "--run", "x=[1]"]).ok).toBe(false)
    expect(parseCheckArgs(["--url", "https://a.test", "--timeout", "5"]).ok).toBe(false)
    expect(parseCheckArgs(["--url", "https://a.test", "--wat"]).ok).toBe(false)
  })
})

describe("webmcp:check exit codes", () => {
  const options = { expectTools: [] }
  const tools = [{ name: "add_task" }, { name: "list_tasks" }]
  const requested = [
    { name: "add_task", input: { title: "first" } },
    { name: "add_task", input: { title: "second" } },
  ]
  test.each(
    [
      [],
      [{ ...requested[0], output: "{}" }],
      [
        { ...requested[1], output: "{}" },
        { ...requested[0], output: "{}" },
      ],
      [{ ...requested[0], output: "{}" }, { ...requested[1] }],
    ].map((runs) => [runs]),
  )("rejects unfinished or mismatched requested runs: %j", (runs) => {
    const result = evaluateReport({ tools, runs }, { ...options, runs: requested })
    expect(result.exitCode).toBe(EXIT.failed)
    expect(result.problems.length).toBeGreaterThan(0)
  })
  test("accepts every requested occurrence in order, including repeated names", () => {
    expect(
      evaluateReport(
        { tools, runs: requested.map((run) => ({ ...run, output: "{}" })) },
        { ...options, runs: requested },
      ).exitCode,
    ).toBe(EXIT.ok)
  })
  test("a structured error returned by the page fails the check, as it does in Try it", () => {
    const report = {
      tools,
      runs: [
        { name: "list_tasks", output: JSON.stringify({ tasks: [] }) },
        { name: "add_task", output: JSON.stringify({ error: { field: "title", constraint: "minLength: 1", got: "" } }) },
      ],
    }
    const result = evaluateReport(report, options)
    expect(result.exitCode).toBe(EXIT.toolError)
    expect(result.runs.map((run) => run.outcome)).toEqual(["completed", "application-error"])
  })

  test("no tools, a missing expected tool, a tool that is not registered, and a load failure each fail", () => {
    expect(evaluateReport({ tools: [], runs: [] }, options).exitCode).toBe(EXIT.noTools)
    expect(evaluateReport({ tools: [], runs: [] }, { expectTools: ["required"] }).exitCode).toBe(EXIT.failed)
    expect(evaluateReport({ tools, runs: [] }, { expectTools: ["complete_task"] }).exitCode).toBe(EXIT.failed)
    expect(evaluateReport({ tools, runs: [{ name: "x", error: "tool not registered" }] }, options).exitCode).toBe(EXIT.toolError)
    expect(evaluateReport({ error: "the page did not load in time" }, options).exitCode).toBe(EXIT.failed)
    expect(evaluateReport({ tools, runs: [{ name: "list_tasks", output: "{}" }] }, options).exitCode).toBe(EXIT.ok)
  })
})

// Different secrets can produce identical display projections, but are different requested runs.
test.each([
  [{ password: "first-secret" }, { password: "second-secret" }],
  [{ nested: { apiKey: "first-key" } }, { nested: { apiKey: "second-key" } }],
  [{ text: "password=first-secret" }, { text: "password=second-secret" }],
])("run matching compares original inputs before redaction", (requested, actual) => {
  const result = evaluateReport(
    { tools: [{ name: "echo" }], runs: [{ name: "echo", input: actual, output: "{}" }] },
    { expectTools: [], runs: [{ name: "echo", input: requested }] },
  )
  expect(result.exitCode).toBe(EXIT.failed)
  expect(JSON.stringify(result)).not.toMatch(/first-secret|second-secret|first-key|second-key/)
})


test("disk receipts bind secret inputs and occurrence order without retaining a secret or key", () => {
  const receiptKey = randomBytes(32).toString("hex")
  const runs = [
    { name: "echo", input: { nested: { password: "first-secret" }, count: 1 } },
    { name: "echo", input: { nested: { password: "second-secret" }, count: 1 } },
  ]
  const report = redactWebMcpReport({
    tools: [{ name: "echo" }],
    runs: runs.map((run, index) => ({ ...run, output: "{}", inputReceipt: runInputReceipt(receiptKey, index, run) })),
  })
  const evaluate = (recorded, requested = runs, key = receiptKey) =>
    evaluateReport({ ...report, runs: recorded }, { expectTools: [], runs: requested }, undefined, key)
  expect(report.runs[0].input).toEqual(report.runs[1].input)
  expect(evaluate(report.runs).exitCode).toBe(EXIT.ok)
  expect(evaluate(report.runs, runs.map((run) => ({ ...run, input: { count: 1, nested: run.input.nested } }))).exitCode).toBe(EXIT.ok)
  expect(evaluate([...report.runs].reverse()).exitCode).toBe(EXIT.failed)
  expect(evaluate(report.runs, [runs[1], runs[1]]).exitCode).toBe(EXIT.failed)
  expect(evaluate(report.runs, runs, randomBytes(32).toString("hex")).exitCode).toBe(EXIT.failed)
  expect(evaluate(report.runs.map((run) => ({ ...run, inputReceipt: undefined }))).exitCode).toBe(EXIT.failed)
  expect(evaluateReport(report, { expectTools: [], runs }).exitCode).toBe(EXIT.failed)
  expect(JSON.stringify(report)).not.toMatch(/first-secret|second-secret/)
  expect(JSON.stringify(report)).not.toContain(receiptKey)
  expect(JSON.stringify(evaluate(report.runs))).not.toContain("inputReceipt")
})


test.each([false, true])("tool and run identities survive diagnostic collisions (disk: %s)", (disk) => {
  const actual = "ghp_BBBBBBBBBBBBBBBB"
  const missing = "ghp_AAAAAAAAAAAAAAAA"
  const key = disk ? randomBytes(32).toString("hex") : undefined
  const run = { name: actual, input: {} }
  const raw = {
    tools: [{ name: actual, ...(key ? { identityReceipt: toolIdentityReceipt(key, actual) } : {}) }],
    runs: [{ ...run, output: "{}", ...(key ? { inputReceipt: runInputReceipt(key, 0, run) } : {}) }],
  }
  const report = disk ? redactWebMcpReport(raw) : raw
  const evaluate = (name) => evaluateReport(report, { expectTools: [name], runs: [{ name, input: {} }] }, undefined, key)
  expect(evaluate(actual).exitCode).toBe(EXIT.ok)
  const result = evaluate(missing)
  expect(result.exitCode).toBe(EXIT.failed)
  expect(result.problems).toContain("Expected tool not registered: [redacted]")
  expect(result.problems).toContain("Requested run 1 ([redacted]) has no matching completed report.")
  expect(JSON.stringify(result)).not.toMatch(/ghp_[AB]+/)
  if (disk) {
    expect(evaluateReport({ ...report, tools: [{ name: "[redacted]" }] }, { expectTools: [actual] }, undefined, key).exitCode).toBe(EXIT.failed)
    expect(evaluateReport(report, { expectTools: [actual] }, undefined, "wrong-key").exitCode).toBe(EXIT.failed)
  }
})
