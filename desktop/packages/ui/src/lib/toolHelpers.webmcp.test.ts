import { describe, expect, test } from "vitest"
import { dict } from "@/lib/i18n/messages/en"
import {
  WEBMCP_ARGUMENTS_MISSING,
  WEBMCP_FAILURE_REASONS,
  webMcpResultPreview,
  describeWebMcpCall,
  readWebMcpDefinitionDigest,
  readWebMcpInvokeInput,
  desktopWebMcpResultFailed,
  desktopWebMcpResultOutcome,
  desktopWebMcpRowTitle,
  formatToolInput,
  getToolMetadata,
  redactDisplayedText,
  webMcpEffect,
} from "@/lib/toolHelpers"

describe("WebMCP display text", () => {
  test("redacts credential-like text and truncates the rest", () => {
    expect(redactDisplayedText("password=supersecretvalue")).toEqual({ redacted: true })
    expect(redactDisplayedText("   ")).toBeNull()
    const tail = "UNIQUE_TAIL"
    const shown = redactDisplayedText(`${"A".repeat(300)}${tail}`)
    expect(shown).toEqual({ redacted: false, value: expect.stringContaining("…") })
    if (shown && !shown.redacted) {
      expect(shown.value).not.toContain(tail)
      expect(shown.value.length).toBeLessThanOrEqual(140)
    }
  })

  test("keeps an element label that merely says Password", () => {
    const call = describeWebMcpCall(undefined, {
      operation: "act",
      how: "click",
      element: { ref: "e2", kind: "button", name: "Password", submit: false },
    })
    expect(call.element).toEqual({ ref: "e2", kind: "button", name: "Password", submit: false })
    expect(call.text).toBeNull()
    expect(call.how).toBe("click")
  })
})

describe("WebMCP invoke arguments", () => {
  test("does not invent arguments from the model payload", () => {
    const call = describeWebMcpCall(
      { action: "invoke", toolName: "search-flights", input: { q: "INVENTED_ARGUMENT" } },
      { operation: "invoke", toolName: "search-flights" },
    )
    expect(call.argumentsMissing).toBe(true)
    expect(call.argumentsText).toBeNull()
    expect(JSON.stringify(call)).not.toContain("INVENTED_ARGUMENT")

    const formatted = formatToolInput(
      { action: "invoke", toolName: "search-flights", input: { q: "INVENTED_ARGUMENT" } },
      "desktop_webmcp",
    )
    expect(formatted).toContain(WEBMCP_ARGUMENTS_MISSING)
    expect(formatted).not.toContain("INVENTED_ARGUMENT")
    expect(formatted).not.toContain("{}")
  })

  test("shows a real arguments object with secrets removed", () => {
    const call = describeWebMcpCall(undefined, {
      operation: "invoke",
      toolName: "search-flights",
      arguments: { city: "Toronto", note: "password=supersecretvalue" },
    })
    expect(call.argumentsMissing).toBe(false)
    expect(call.argumentsText).toContain("Toronto")
    expect(call.argumentsText).not.toContain("supersecretvalue")
    expect(call.argumentsText).toContain("[redacted]")
  })

  test("keeps a long argument for diagnosis and reads only a real definition digest", () => {
    const title = "x".repeat(200)
    expect(readWebMcpInvokeInput({ arguments: { title } })).toEqual({ kind: "object", input: { title } })
    expect(readWebMcpInvokeInput({ inputPreview: '{"title":"Ship"}' })).toEqual({
      kind: "preview",
      input: { title: "Ship" },
    })
    expect(readWebMcpInvokeInput({ inputPreview: "not json" })).toEqual({ kind: "unparsed", input: null })
    expect(readWebMcpInvokeInput({ inputPreview: "password=supersecretvalue" })).toEqual({
      kind: "redacted",
      input: null,
    })
    // metadata.input is a receipt. An empty metadata bag is not, and the model payload is not read here.
    expect(readWebMcpInvokeInput({})).toEqual({ kind: "missing", input: null })
    expect(readWebMcpInvokeInput(undefined)).toEqual({ kind: "missing", input: null })
    expect(readWebMcpDefinitionDigest({ definitionDigest: "abcdabcd" })).toBe("abcdabcd")
    expect(readWebMcpDefinitionDigest({ schemaDigest: "ab".repeat(16) })).toBe("ab".repeat(16))
    expect(readWebMcpDefinitionDigest({ digest: "zz" })).toBeNull()
    expect(readWebMcpDefinitionDigest({ digest: "not-a-digest" })).toBeNull()
  })

  test("catalog English matches the runtime placeholder", () => {
    expect(WEBMCP_ARGUMENTS_MISSING).toBe("arguments not provided by the runtime")
    expect(dict["chat.permissionCard.webmcp.argumentsMissing"]).toBe(WEBMCP_ARGUMENTS_MISSING)
    expect(dict["chat.toolPart.webmcp.argumentsMissing"]).toBe(WEBMCP_ARGUMENTS_MISSING)
    expect(dict["chat.toolPart.webmcp.failed"]).toBe("Failed")
  })
})

describe("desktop_webmcp row title and failure", () => {
  test("names the page tool, then the operation", () => {
    expect(desktopWebMcpRowTitle({ action: "invoke", toolName: "search-flights" }, { operation: "invoke" })).toBe(
      "search-flights",
    )
    expect(desktopWebMcpRowTitle({ action: "navigate" }, undefined)).toBe("navigate")
    expect(getToolMetadata("desktop_webmcp").displayName).toBe("Desktop webmcp")
    expect(
      getToolMetadata("desktop_webmcp", { input: { toolName: "search-flights" }, metadata: { operation: "invoke" } })
        .displayName,
    ).toBe("search-flights")
    expect(getToolMetadata("bash").displayName).toBe("Shell Command")
  })

  test("reads page-tool failure from a completed result and ignores misses", () => {
    const completed = (result: unknown) =>
      desktopWebMcpResultFailed({
        status: "completed",
        output: JSON.stringify({ untrusted: true, result }),
      })
    expect(completed({ isError: true, errorText: "page failed" })).toBe(true)
    expect(completed({ status: "Error", errorText: "nope" })).toBe(true)
    expect(completed({ ok: false })).toBe(true)
    expect(completed({ error: "stale" })).toBe(true)
    expect(completed({ status: "canceled" })).toBe(true)
    expect(completed({ done: true, navigated: true })).toBe(false)
    expect(completed({ found: false })).toBe(false)
    expect(completed({ text: "an error occurred" })).toBe(false)
    expect(desktopWebMcpResultFailed({ status: "error", output: "" })).toBe(true)
    expect(desktopWebMcpResultFailed({ status: "running", output: JSON.stringify({ isError: true }) })).toBe(false)
    expect(desktopWebMcpResultFailed({ status: "completed", output: "not json" })).toBe(false)
  })

  test("hides short secrets, values under sensitive keys and text typed into sensitive fields", () => {
    expect(redactDisplayedText("password=hunter2")).toEqual({ redacted: true })
    const invoke = describeWebMcpCall(
      { action: "invoke" },
      { operation: "invoke", arguments: { email: "a@example.com", password: "hunter2", nested: { apiKey: "x1" } } },
    )
    expect(invoke.argumentsText).toContain("a@example.com")
    expect(invoke.argumentsText).not.toContain("hunter2")
    expect(invoke.argumentsText).not.toContain("x1")
    const act = describeWebMcpCall(
      { action: "act", text: "hunter2" },
      { operation: "act", text: "hunter2", element: { ref: "e1", kind: "textbox", name: "Password" } },
    )
    expect(act.text).toEqual({ redacted: true })
  })

  test("a timed-out, cancelled or aborted call is a failure", () => {
    for (const status of ["timeout", "cancelled", "aborted"]) expect(desktopWebMcpResultFailed({ status })).toBe(true)
    expect(desktopWebMcpResultFailed({ status: "running" })).toBe(false)
  })

  test("reads the runtime's invocation preview, failure reason and next step (ADR-266), and ignores what it does not know", () => {
    const withPreview = describeWebMcpCall(
      { action: "invoke" },
      { operation: "invoke", inputPreview: '{"query":"shoes","token":"[redacted]"}' },
    )
    expect(withPreview.argumentsMissing).toBe(false)
    expect(withPreview.argumentsText).toBe('{"query":"shoes","token":"[redacted]"}')
    // A preview that still looks like a credential is not shown.
    expect(
      describeWebMcpCall({ action: "invoke" }, { operation: "invoke", inputPreview: "password=hunter2" }).argumentsText,
    ).toBe("[redacted]")
    const failed = describeWebMcpCall(
      { action: "invoke" },
      { operation: "invoke", reason: "invalid-input", nextAction: "List the tools again and use the invoke template." },
    )
    expect(failed.failureReason).toBe("invalid-input")
    expect(failed.nextAction).toBe("List the tools again and use the invoke template.")
    // Older runtimes: no preview means arguments are reported missing; unknown reasons are ignored.
    const older = describeWebMcpCall({ action: "invoke" }, { operation: "invoke", reason: "something-new" })
    expect(older.argumentsMissing).toBe(true)
    expect(older.failureReason).toBeNull()
    expect(dict["chat.toolPart.webmcp.reason.invalid-input"]).toBeTruthy()
  })
})

describe("WebMCP approval effect", () => {
  const element = (submit: boolean) => ({ ref: "e4", kind: "button", name: "Pay now", submit })
  test("states what the call does from call data only", () => {
    const origin = "https://shop.test"
    expect(webMcpEffect({ operation: "invoke", toolName: "add_task", how: null, element: null }, origin)).toEqual({
      key: "invoke",
      params: { tool: "add_task", target: "", origin },
    })
    expect(webMcpEffect({ operation: "act", toolName: null, how: "click", element: element(true) }, origin).key).toBe(
      "clickSubmit",
    )
    expect(webMcpEffect({ operation: "act", toolName: null, how: "click", element: element(false) }, origin).key).toBe(
      "click",
    )
    expect(webMcpEffect({ operation: "act", toolName: null, how: "type", element: element(false) }, origin)).toMatchObject({
      key: "type",
      params: { target: "Pay now" },
    })
    expect(webMcpEffect({ operation: "navigate", toolName: null, how: null, element: null }, origin).key).toBe("navigate")
  })

  test("never claims a specific effect it cannot see", () => {
    // An act without a target, an invoke without a tool name, and an unknown operation all fall back to the generic line.
    expect(webMcpEffect({ operation: "act", toolName: null, how: "click", element: null }, "https://a.test").key).toBe("other")
    expect(webMcpEffect({ operation: "invoke", toolName: null, how: null, element: null }, "https://a.test").key).toBe("other")
    expect(webMcpEffect({ operation: "mystery", toolName: "x", how: null, element: null }, "").params.origin).toBe("—")
    const long = { ref: "e1", kind: "button", name: "x".repeat(500), submit: false }
    expect(
      webMcpEffect({ operation: "act", toolName: null, how: "click", element: long }, "https://a.test").params.target.length,
    ).toBeLessThanOrEqual(80)
  })

  test("every effect key has English text", () => {
    for (const key of ["invoke", "click", "clickSubmit", "type", "select", "navigate", "other"])
      expect(dict[`chat.permissionCard.webmcp.effect.${key}` as keyof typeof dict]).toBeTruthy()
  })
})

test("manual failure reasons share transcript labels and the known reason vocabulary", () => {
  for (const reason of WEBMCP_FAILURE_REASONS) {
    expect(describeWebMcpCall(undefined, { reason }).failureReason).toBe(reason)
    expect(dict[`chat.toolPart.webmcp.reason.${reason}`]).toBeTruthy()
  }
})

test("manual previews filter parsed JSON credentials, cycles and deeply nested or excessive output", () => {
  expect(webMcpResultPreview('{"password":"hunter2","nested":{"apiKey":"x1"}}')).not.toContain("hunter2")
  expect(webMcpResultPreview('{"password":"hunter2","nested":{"apiKey":"x1"}}')).not.toContain("x1")
  const cycle: Record<string, unknown> = { text: "normal" }
  cycle.self = cycle
  expect(webMcpResultPreview(cycle)).toContain("…")
  let deep: unknown = "tail"
  for (let index = 0; index < 30; index++) deep = { deep }
  expect(webMcpResultPreview(deep)).not.toContain("tail")
  expect(webMcpResultPreview(Array.from({ length: 1000 }, () => "a".repeat(9000))).length).toBeLessThanOrEqual(4000)
  expect(webMcpResultPreview(undefined)).toBe("")
  expect(webMcpResultPreview("short", "apiToken")).toBe("[redacted]")
  expect(webMcpResultPreview(`${"a".repeat(5000)} password=short`)).toBe("[redacted]")
})

test.each(["timeout", "cancelled", "canceled", "aborted"])(
  "returned %s wins over generic error flags in transcript outcomes",
  (status) => {
    const result = { status: ` ${status.toUpperCase()} `, isError: true, ok: false }
    const expected = status === "timeout" ? "timeout" : "cancelled"
    for (const output of [result, { untrusted: true, result }, JSON.stringify({ untrusted: true, result })]) {
      expect(desktopWebMcpResultOutcome({ status: "completed", output })).toBe(expected)
      expect(desktopWebMcpResultFailed({ status: "completed", output })).toBe(true)
    }
  },
)

test("a structured error object, as the builder guide recommends, is an application error on the transcript too", () => {
  const output = JSON.stringify({ untrusted: true, result: { error: { field: "title", constraint: "minLength: 1", got: "   " } } })
  expect(desktopWebMcpResultOutcome({ status: "completed", output })).toBe("application-error")
  for (const harmless of [{ error: null }, { error: {} }, { found: false }])
    expect(desktopWebMcpResultOutcome({ status: "completed", output: JSON.stringify(harmless) })).toBe("completed")
})

test("shown inputs redact secret-named fields and credential-shaped text", async () => {
  const { redactWebMcpInput, isWebMcpSensitiveName } = await import("@/lib/toolHelpers")
  expect(redactWebMcpInput({ user: "ada", password: "hunter22", note: "ghp_abcdefghijklmnopqrstuvwxyz0123456789" })).toEqual({
    user: "ada",
    password: "[redacted]",
    note: "[redacted]",
  })
  expect(isWebMcpSensitiveName("accessToken")).toBe(true)
  expect(isWebMcpSensitiveName("title")).toBe(false)
})
