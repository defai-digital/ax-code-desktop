import { afterEach, describe, expect, test, vi } from "vitest"
import { cleanup, render } from "@/test/dom"

const sync = vi.hoisted(() => ({ messages: [] as unknown[], parts: new Map<string, unknown[]>() }))
vi.mock("@/sync/sync-context", () => ({
  useSessionMessages: () => sync.messages,
  useDirectorySync: (selector: (state: { part: Map<string, unknown[]> }) => unknown) => selector({ part: sync.parts }),
}))
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      params ? `${key}:${Object.values(params).join("|")}` : key,
  }),
}))

import { ReviewLandingBrowserEvidence } from "./ReviewLandingBrowserEvidence"
import { fingerprintWebMcpRecap, sameWebMcpRecapFingerprint } from "./reviewLandingBrowserRecap"

const outputOf = (result: string) => JSON.stringify({ untrusted: true, result })

const tool = (id: string, status: string, output?: string) => ({
  id,
  type: "tool",
  tool: "desktop_webmcp",
  callID: id,
  state: {
    status,
    input: { action: "invoke", toolName: id },
    metadata: { operation: "invoke", toolName: id },
    ...(output === undefined ? {} : { output }),
  },
})

afterEach(() => {
  cleanup()
  sync.messages = []
  sync.parts = new Map()
})

describe("webmcp recap fingerprint", () => {
  test("an assistant text part does not change the fingerprint", () => {
    const call = tool("checkout", "completed", outputOf("paid"))
    const messages = [
      { id: "u", role: "user" },
      { id: "a", role: "assistant" },
    ]
    const parts = (text: string) => (id: string) =>
      id === "a" ? [call, { id: "t", type: "text", text }] : [{ id: "user-text", type: "text", text: "go" }]
    const before = fingerprintWebMcpRecap(messages, parts("Hel"))
    const after = fingerprintWebMcpRecap(messages, parts("Hello"))
    expect(sameWebMcpRecapFingerprint(before, after)).toBe(true)
    expect(before).toEqual([["checkout", "completed", outputOf("paid")]])
  })

  test("a call completing changes the fingerprint and still includes that call", () => {
    const older = tool("older-tool", "completed", outputOf("kept"))
    const running = tool("newest-tool", "running")
    const completed = tool("newest-tool", "completed", outputOf("newest-done"))
    const messages = [
      { id: "earlier", role: "assistant" },
      { id: "u", role: "user" },
      { id: "a", role: "assistant" },
    ]
    const before = fingerprintWebMcpRecap(messages, (id) => (id === "a" ? [older, running] : [tool("ignored", "completed", outputOf("no"))]))
    const after = fingerprintWebMcpRecap(messages, (id) => (id === "a" ? [older, completed] : undefined))
    expect(sameWebMcpRecapFingerprint(before, after)).toBe(false)
    expect(after).toEqual([
      ["older-tool", "completed", outputOf("kept")],
      ["newest-tool", "completed", outputOf("newest-done")],
    ])
  })
})

describe("landing recap while tokens stream", () => {
  test("a text token does not parse tool output again, and the newest completed call stays in the recap", () => {
    const keptOutput = outputOf("kept")
    const newestOutput = outputOf("newest-done")
    const kept = tool("older-tool", "completed", keptOutput)
    const running = tool("newest-tool", "running")
    sync.messages = [
      { id: "u", role: "user" },
      { id: "a", role: "assistant" },
    ]
    sync.parts = new Map([["a", [kept, { id: "t", type: "text", text: "Hi" }, running]]])
    const parse = vi.spyOn(JSON, "parse")
    const parsesOf = (value: string) => parse.mock.calls.filter((args) => args[0] === value).length

    const view = render(<ReviewLandingBrowserEvidence directory="/repo" sessionId="s1" />)
    const parsedKept = parsesOf(keptOutput)
    expect(parsedKept).toBeGreaterThan(0)
    expect(view.container.textContent).toContain("older-tool")
    expect(view.container.textContent).not.toContain("newest-done")

    sync.parts = new Map([["a", [kept, { id: "t", type: "text", text: "Hi there" }, running]]])
    view.rerender(<ReviewLandingBrowserEvidence directory="/repo" sessionId="s1" />)
    expect(parsesOf(keptOutput)).toBe(parsedKept)
    expect(parsesOf(newestOutput)).toBe(0)

    const newest = tool("newest-tool", "completed", newestOutput)
    sync.parts = new Map([["a", [kept, { id: "t", type: "text", text: "Hi there" }, newest]]])
    view.rerender(<ReviewLandingBrowserEvidence directory="/repo" sessionId="s1" />)
    expect(parsesOf(newestOutput)).toBeGreaterThan(0)
    expect(view.container.textContent).toContain("newest-tool")
    expect(view.container.textContent).toContain("newest-done")
    parse.mockRestore()
  })
})
