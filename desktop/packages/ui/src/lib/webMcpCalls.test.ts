import { describe, expect, test } from "vitest"
import { collectWebMcpCalls, latestTurnMessages, WEBMCP_CALL_SCAN_MESSAGES } from "./webMcpCalls"

const tool = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: "tool",
  tool: "desktop_webmcp",
  state: { status, input: { action: "invoke", toolName: "add_numbers" }, metadata: { operation: "invoke", toolName: "add_numbers" }, time: { start: 1 }, ...extra },
})

describe("collectWebMcpCalls", () => {
  test("lists the session's page-tool calls newest first with outcome, reason and redacted arguments, ignoring other tools", () => {
    const parts = new Map<string, unknown[]>([
      ["m1", [tool("p1", "completed", { metadata: { operation: "invoke", toolName: "add_numbers", inputPreview: '{"a":2,"b":3}' } })]],
      ["m2", [{ id: "x", type: "tool", tool: "bash", state: { status: "completed" } }, tool("p2", "error", { metadata: { operation: "invoke", toolName: "add_numbers", reason: "invalid-input" } })]],
      ["m3", [tool("p3", "running")]],
    ])
    const calls = collectWebMcpCalls([{ id: "m1" }, { id: "m2" }, { id: "m3" }], (id) => parts.get(id) as never)
    expect(calls.map((call) => [call.id, call.title, call.outcome, call.failureReason])).toEqual([
      ["p3", "add_numbers", "running", null],
      ["p2", "add_numbers", "failed", "invalid-input"],
      ["p1", "add_numbers", "ok", null],
    ])
    expect(calls[2].argumentsText).toBe('{"a":2,"b":3}')
  })

  test("a persisted failure reason and next step are not repeated as raw rejection text", () => {
    const failed = tool("p1", "error", {
      // The runtime appends the next step to the model-visible error text as well.
      error:
        "No project browser is enrolled for this coding session.\nnextAction: Ask the user to enable agent access in the project browser pane.",
      metadata: { reason: "provider-gone", nextAction: "Ask the user to enable agent access in the project browser pane." },
    })
    const [call] = collectWebMcpCalls([{ id: "m1" }], () => [failed] as never)
    expect(call.failureReason).toBe("provider-gone")
    const texts = (call.rejections ?? []).map((rejection) => rejection.text)
    expect(texts).not.toContain("provider-gone")
    expect(texts.join(" ")).not.toContain("Ask the user to enable agent access")
  })

  test("caps the list", () => {
    const parts = new Map([["m", Array.from({ length: 30 }, (_, index) => tool(`p${index}`, "completed"))]])
    expect(collectWebMcpCalls([{ id: "m" }], (id) => parts.get(id) as never, 5)).toHaveLength(5)
  })

  test("the latest turn starts at the person's last message, read from role or info.role, within the scan window", () => {
    const messages = [{ id: "u1", info: { role: "user" } }, { id: "a1", role: "assistant" }, { id: "u2", info: { role: "user" } }, { id: "a2" }]
    expect(latestTurnMessages(messages).map((message) => message.id)).toEqual(["u2", "a2"])
    const long = Array.from({ length: WEBMCP_CALL_SCAN_MESSAGES + 40 }, (_, index) => ({ id: `m${index}`, role: "assistant" }))
    expect(latestTurnMessages(long)).toHaveLength(WEBMCP_CALL_SCAN_MESSAGES)
  })

  test("carries the message, duration, page generation and a filtered result preview without the untrusted envelope", () => {
    const parts = new Map<string, unknown[]>([
      [
        "m1",
        [
          tool("ok", "completed", {
            metadata: { operation: "invoke", toolName: "add_numbers", generation: "gen-1" },
            time: { start: 1000, end: 2400 },
            output: JSON.stringify({ untrusted: true, result: { sum: 5, token: "ghp_abcdefghijklmnopqrstuvwxyz0123456789" } }),
          }),
          tool("bad", "error", { output: JSON.stringify({ untrusted: true, result: { sum: 1 } }) }),
        ],
      ],
    ])
    const [failed, ok] = collectWebMcpCalls([{ id: "m1" }], (id) => parts.get(id) as never)
    expect(ok).toMatchObject({ messageId: "m1", durationMs: 1400, generation: "gen-1" })
    expect(ok.resultPreview).toContain('"sum": 5')
    expect(ok.resultPreview).not.toContain("untrusted")
    expect(ok.resultPreview).not.toContain("ghp_")
    expect(ok.resultPreview!.length).toBeLessThanOrEqual(140)
    // A failed call shows its reason, never a result.
    expect(failed.resultPreview).toBeNull()
    expect(failed.durationMs).toBeNull()
  })

  test("records a runtime definition digest and does not guess arguments from the model payload", () => {
    const parts = new Map<string, unknown[]>([
      [
        "m1",
        [
          tool("p1", "completed", {
            input: { action: "invoke", toolName: "add_numbers", input: { a: 9 } },
            metadata: { operation: "invoke", toolName: "add_numbers", definitionDigest: "ab".repeat(8) },
          }),
        ],
      ],
    ])
    const [call] = collectWebMcpCalls([{ id: "m1" }], (id) => parts.get(id) as never)
    expect(call.definitionDigest).toBe("ab".repeat(8))
    expect(call.argumentsMissing).toBe(true)
    expect(call.inputKind).toBe("missing")
    expect(call.input).toBeNull()
    expect(JSON.stringify(call)).not.toContain('"a":9')
  })

  test("unwraps only the runtime envelope, so a tool's own result field is kept", () => {
    const parts = new Map<string, unknown[]>([["m1", [tool("own", "completed", { output: JSON.stringify({ result: { id: 7 }, extra: 1 }) })]]])
    const [call] = collectWebMcpCalls([{ id: "m1" }], (id) => parts.get(id) as never)
    expect(call.resultPreview).toContain('"extra": 1')
  })
})

test.each(["checkpointed", "cancelled"])("terminal %s calls retain their outcome", (status) => {
  const calls = collectWebMcpCalls([{ id: "m" }], () => [tool("p", status)] as never)
  expect(calls[0].outcome).toBe(status)
})

test("agent receipts bind to main-issued keys without retaining real names, including historical definitions", async () => {
  const { credentialToolFixture } = await import("@/test/webMcpCatalog")
  const { diffWebMcpRegistration, webMcpKnownDefinitions } = await import("./webMcpCatalog")
  const fixture = credentialToolFixture()
  const before = fixture.project()
  const after = fixture.project(true)
  const definitions = webMcpKnownDefinitions({ catalog: after, registration: diffWebMcpRegistration(before, after, []) })
  const parts = [{ type: "tool", tool: "desktop_webmcp", state: {
    status: "completed", input: { action: "invoke", toolName: fixture.names[1] },
    metadata: { operation: "invoke", toolName: fixture.names[1], definitionDigest: before[1].definitionDigest }, output: "{}",
  } }]
  const [call] = collectWebMcpCalls([{ id: "m" }], () => parts, 20, undefined, definitions)
  expect(call).toMatchObject({ outcome: "ok", invocationID: before[1].invocationID,
    definitionDigest: before[1].definitionDigest, toolName: "[redacted tool 2]", title: "[redacted tool 2]" })
  expect(call.invocationID).not.toBe(before[0].invocationID)
  expect(JSON.stringify(call)).not.toMatch(/ghp_/)
  expect(collectWebMcpCalls([{ id: "m" }], () => parts)[0].invocationID).toBeUndefined()
  const ambiguous = [before[1], { ...before[1], invocationID: before[0].invocationID }]
  expect(collectWebMcpCalls([{ id: "m" }], () => parts, 20, undefined, ambiguous)[0].invocationID).toBeUndefined()
})
