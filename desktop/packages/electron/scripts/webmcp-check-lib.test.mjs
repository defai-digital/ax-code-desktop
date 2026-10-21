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
    expect(evaluateReport({ tools, runs: [] }, { expectTools: ["complete_task"] }).exitCode).toBe(EXIT.failed)
    expect(evaluateReport({ tools, runs: [{ name: "x", error: "tool not registered" }] }, options).exitCode).toBe(EXIT.toolError)
    expect(evaluateReport({ error: "the page did not load in time" }, options).exitCode).toBe(EXIT.failed)
    expect(evaluateReport({ tools, runs: [{ name: "list_tasks", output: "{}" }] }, options).exitCode).toBe(EXIT.ok)
  })
})
