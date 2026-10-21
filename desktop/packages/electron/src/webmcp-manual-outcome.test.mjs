import { describe, expect, test } from "vitest"
import { manualToolResult, manualToolFailure } from "./webmcp-manual-outcome.js"

describe("manual outcome mapping", () => {
  test("normal transport completion remains successful only for normal output", () => {
    for (const output of ["ok", { value: 5 }, { found: false }, { done: true }, { error: "" }])
      expect(manualToolResult({ output })).toEqual({ ok: true, outcome: "completed", output })
  })
  test.each([
    { isError: true },
    { ok: false },
    { error: "failed" },
    { errorText: "failed" },
    { status: "Error" },
    { untrusted: true, result: { isError: true } },
    JSON.stringify({ isError: true }),
  ])("application-error payload %j never becomes success", (output) => {
    expect(manualToolResult({ output })).toEqual({
      ok: false,
      outcome: "application-error",
      reason: "application-error",
      output,
    })
  })
  test.each([
    ["application-error", "application-error"],
    ["timeout", "timeout"],
    ["cancelled", "cancelled"],
    ["uncertain", "provider-gone"],
    ["failed", "invalid-input"],
    ["failed", "definition-changed"],
    ["failed", "result-too-large"],
    ["failed", "input-too-large"],
  ])("maps %s with one fixed failure vocabulary", (outcome, reason) => {
    expect(manualToolFailure(Object.assign(new Error("password=hunter2"), { outcome, reason }))).toEqual({
      ok: false,
      outcome,
      reason,
    })
  })
  test("unclassified exceptions are uncertain and never expose page or debugger errors", () => {
    expect(manualToolFailure(new Error("token=secret"))).toEqual({
      ok: false,
      outcome: "uncertain",
      reason: "provider-gone",
    })
    expect(manualToolFailure({ outcome: "__proto__", reason: "token=secret" })).toEqual({
      ok: false,
      outcome: "uncertain",
      reason: "provider-gone",
    })
  })
})

test.each(["timeout", "canceled", "cancelled", "aborted"])(
  "returned %s is explicit even with error flags and envelopes",
  (status) => {
    const outcome = status === "timeout" ? "timeout" : "cancelled"
    const result = { status: ` ${status.toUpperCase()} `, isError: true, ok: false }
    for (const output of [result, { untrusted: true, result }, JSON.stringify({ untrusted: true, result })])
      expect(manualToolResult({ output })).toEqual({ ok: false, outcome, reason: outcome, output })
  },
)
