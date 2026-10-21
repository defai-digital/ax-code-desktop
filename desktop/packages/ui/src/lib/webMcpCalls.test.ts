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
})
