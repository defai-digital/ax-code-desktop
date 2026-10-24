import type { Message, Part, ToolPart } from "@defai-digital/ax-code-sdk/v2/client"
import { describe, expect, test } from "vitest"
import { EXTERNAL_SESSION_ACTIVITY_MAX_AGE_MS, inferExternalSessionActivity } from "./external-session-activity"

const user: Message = {
  id: "user",
  sessionID: "session",
  role: "user",
  time: { created: 20 },
  agent: "build",
  model: { providerID: "test", modelID: "test" },
}
const assistant: Message = {
  id: "assistant",
  sessionID: "session",
  role: "assistant",
  time: { created: 30 },
  parentID: user.id,
  modelID: "test",
  providerID: "test",
  mode: "build",
  agent: "build",
  path: { cwd: "/repo", root: "/repo" },
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
}
const tool: ToolPart = {
  id: "tool",
  sessionID: "session",
  messageID: assistant.id,
  type: "tool",
  callID: "call",
  tool: "bash",
  state: { status: "pending", input: {}, raw: "" },
}

function infer(messages: Message[], parts: Part[] = [], updated: number | undefined = 100) {
  return inferExternalSessionActivity({ updated, now: 100, messages, parts })
}

describe("inferExternalSessionActivity", () => {
  test("recognizes a fresh accepted instruction regardless of message order", () => {
    const olderAssistant = { ...assistant, time: { created: 10, completed: 15 } }
    expect(infer([user, olderAssistant])).toBe("running")
    expect(infer([olderAssistant, user])).toBe("running")
  })

  test.each(["pending", "running", "started"])("recognizes a %s tool on the newest assistant", (status) => {
    // The wire can carry started, although the published SDK only names pending/running.
    const part = { ...tool, state: { status, input: {}, time: { start: 30 } } } as ToolPart
    expect(infer([assistant, user], [part])).toBe("running")
    expect(infer([{ ...assistant, time: { created: 30, completed: 40 } }], [part])).toBe("running")
  })

  test("recognizes an assistant still producing text", () => {
    expect(infer([assistant])).toBe("running")
    expect(infer([{ ...assistant, finish: "tool-calls" }])).toBe("running")
  })

  test("a numeric completion is idle even with a recent session update", () => {
    expect(infer([{ ...assistant, time: { created: 30, completed: 40 } }])).toBe("idle")
    expect(infer([{ ...assistant, time: { created: 30, completed: 0 } }])).toBe("idle")
  })

  test.each(["stop", "error", "aborted", "length", "content-filter"])("a terminal %s finish is idle", (finish) => {
    expect(infer([{ ...assistant, finish }])).toBe("idle")
  })

  test("expires stale activity even with an active tool", () => {
    expect(
      inferExternalSessionActivity({
        updated: 100,
        now: 101 + EXTERNAL_SESSION_ACTIVITY_MAX_AGE_MS,
        messages: [assistant],
        parts: [tool],
      }),
    ).toBe("idle")
    expect(
      inferExternalSessionActivity({
        updated: 100,
        now: 100 + EXTERNAL_SESSION_ACTIVITY_MAX_AGE_MS,
        messages: [user],
        parts: [],
      }),
    ).toBe("running")
    expect(inferExternalSessionActivity({ updated: undefined, now: 100, messages: [user], parts: [] })).toBe("idle")
    expect(infer([])).toBe("idle")
  })
})
