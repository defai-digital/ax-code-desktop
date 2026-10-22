import { afterEach, describe, expect, test, vi } from "vitest"
import { nativeWebMcpTool } from "@/test/webMcpCatalog"
import { act } from "react"
import { cleanup, fireEvent, render } from "@/test/dom"

const sync = vi.hoisted(() => ({ messages: [] as unknown[], parts: new Map<string, unknown[]>(), unavailable: false }))
vi.mock("@/sync/sync-context", () => ({
  useSessionMessages: () => sync.messages,
  useDirectorySync: (selector: (state: { part: Map<string, unknown[]> }) => unknown) => sync.unavailable ? undefined : selector({ part: sync.parts }),
}))
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      params ? `${key}:${Object.values(params).join("|")}` : key,
  }),
}))
import { useUIStore } from "@/stores/useUIStore"
import { useWebMcpBrowserStore } from "@/stores/useWebMcpBrowserStore"
import { viewKeyFor } from "@/lib/webMcpViewKey"
import { ReviewLandingBrowserEvidence } from "./ReviewLandingBrowserEvidence"

const call = (id: string, status: string) => ({
  id,
  type: "tool",
  tool: "desktop_webmcp",
  state: { status, input: { action: "invoke", toolName: "checkout" }, metadata: { operation: "invoke", toolName: "checkout", definitionDigest: nativeWebMcpTool({ name: "checkout", description: "Pay", inputSchema: {} }).definitionDigest } },
})

afterEach(() => {
  sync.unavailable = false
  cleanup()
  useWebMcpBrowserStore.setState({ views: {}, order: [], activeKey: null })
  useWebMcpBrowserStore.getState().resetSnapshot()
})

describe("browser evidence beside landing", () => {
  test("counts only the latest turn's page-tool calls and failures", () => {
    sync.messages = [
      { id: "u1", role: "user" },
      { id: "a1", role: "assistant" },
      { id: "u2", role: "user" },
      { id: "a2", role: "assistant" },
    ]
    sync.parts = new Map([
      ["a1", [call("old", "completed")]],
      ["a2", [call("ok", "completed"), call("bad", "error")]],
    ])
    const { container } = render(<ReviewLandingBrowserEvidence directory="/repo" sessionId="s1" />)
    const evidence = container.querySelector<HTMLElement>("[data-landing-browser-evidence]")
    expect(evidence?.dataset.landingBrowserEvidence).toBe("failed")
    expect(evidence?.textContent).toBe("diffView.landing.browserEvidenceFailed:2|1")
  })

  test("shows nothing when the agent did not use the browser this turn", () => {
    sync.messages = [{ id: "u1", role: "user" }, { id: "a1", role: "assistant" }]
    sync.parts = new Map([["a1", [{ id: "b", type: "tool", tool: "bash", state: { status: "completed" } }]]])
    expect(render(<ReviewLandingBrowserEvidence directory="/repo" sessionId="s1" />).container.innerHTML).toBe("")
  })

  test("recaps each step in order with how it was done, how it ended and the tools never called", () => {
    sync.messages = [{ id: "u1", role: "user" }, { id: "a1", role: "assistant" }]
    sync.parts = new Map([
      [
        "a1",
        [
          { id: "r", type: "tool", tool: "desktop_webmcp", state: { status: "completed", input: { action: "read" }, metadata: { operation: "read" } } },
          call("ok", "completed"),
          {
            id: "bad",
            type: "tool",
            tool: "desktop_webmcp",
            state: { status: "error", input: { action: "act" }, metadata: { operation: "act", reason: "page-changed" } },
          },
        ],
      ],
    ])
    useWebMcpBrowserStore.getState().updateSnapshot({
      sessionID: "s1",
      origin: "https://shop.test",
      catalog: [
        nativeWebMcpTool({ name: "checkout", description: "Pay", inputSchema: {} }),
        nativeWebMcpTool({ name: "apply_coupon", description: "Apply a coupon", inputSchema: {} }),
      ],
    })
    const { container } = render(<ReviewLandingBrowserEvidence directory="/repo" sessionId="s1" />)
    const steps = Array.from(container.querySelectorAll("[data-recap-outcome]"), (step) => {
      const copy = step.cloneNode(true) as HTMLElement
      copy.querySelectorAll("[data-webmcp-diagnosis], [data-webmcp-runtime-rejections]").forEach((node) => node.remove())
      return copy.textContent
    })
    expect(steps).toEqual([
      "read · diffView.landing.browserRecap.kind.read · webmcp.calls.outcome.ok",
      `checkout · diffView.landing.browserRecap.kind.invoke · webmcp.calls.outcome.ok · diffView.landing.browserRecap.definition:${nativeWebMcpTool({ name: "checkout", description: "Pay", inputSchema: {} }).definitionDigest!.slice(0, 8)}`,
      "act · diffView.landing.browserRecap.kind.act · webmcp.calls.outcome.failed · chat.toolPart.webmcp.reason.page-changed",
    ])
    expect(container.querySelector("[data-recap-not-called]")?.textContent).toBe(
      "diffView.landing.browserRecap.notCalled:apply_coupon",
    )
    // Another session's page is never read as this session's untouched tools.
    cleanup()
    useWebMcpBrowserStore.getState().updateSnapshot({ sessionID: "other" })
    const other = render(<ReviewLandingBrowserEvidence directory="/repo" sessionId="s1" />)
    expect(other.container.querySelector("[data-recap-not-called]")).toBeNull()
  })

  test.each(["same", "changed", "frame", "missing"])("recap compares native definition identities: %s", async (change) => {
    const original = nativeWebMcpTool({ name: "checkout", description: "Pay", inputSchema: {} })
    const current = change === "changed"
      ? nativeWebMcpTool({ ...original, description: "Updated payment" })
      : change === "frame" ? nativeWebMcpTool(original, "new-frame")
      : change === "missing" ? { ...original, definitionDigest: undefined } : original
    expect(original.digest).not.toBe(original.definitionDigest)
    sync.messages = [{ id: "u1", role: "user" }, { id: "a1", role: "assistant" }]
    sync.parts = new Map([
      [
        "a1",
        [
          {
            id: "prt_1",
            type: "tool",
            tool: "desktop_webmcp",
            state: {
              status: "completed",
              input: { action: "invoke", toolName: "checkout" },
              metadata: { operation: "invoke", toolName: "checkout", definitionDigest: original.definitionDigest },
              time: { start: 0, end: 1500 },
              output: JSON.stringify({ untrusted: true, result: { paid: true } }),
            },
          },
        ],
      ],
    ])
    useWebMcpBrowserStore.getState().updateView(viewKeyFor("/repo", "s1"), {
      sessionID: "s1", directory: "/repo", origin: "https://shop.test", catalog: [original],
    })
    useWebMcpBrowserStore.getState().updateView(viewKeyFor("/repo", "s1"), {
      sessionID: "s1",
      directory: "/repo",
      origin: "https://shop.test",
      catalog: [current, nativeWebMcpTool({ name: "unused", description: "Unused", inputSchema: {} })],
    })
    const { container } = render(<ReviewLandingBrowserEvidence directory="/repo" sessionId="s1" />)
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => undefined)
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
    await act(async () => fireEvent.click(container.querySelector("[data-recap-copy]")!))
    expect(writeText.mock.calls[0][0]).toContain("diffView.landing.browserRecap.notCalled:unused")
    expect(writeText.mock.calls[0][0].includes("diffView.landing.browserRecap.definitionChanged")).toBe(change === "changed" || change === "frame")
    const step = container.querySelector("[data-recap-outcome]")!
    expect(step.textContent).toContain("1.5 s")
    expect(step.querySelector("[data-recap-result]")?.textContent).toContain('"paid": true')
    expect(step.querySelector("[data-recap-definition]")?.getAttribute("title")).toBe(original.definitionDigest)
    expect(Boolean(step.querySelector("[data-recap-definition-changed]"))).toBe(change === "changed" || change === "frame")
    fireEvent.click(step.querySelector<HTMLButtonElement>("[data-recap-open]")!)
    expect(useUIStore.getState().pendingMessageNavigation).toEqual({ sessionId: "s1", messageId: "a1", partId: "prt_1" })
    useUIStore.getState().setPendingMessageNavigation(null)
  })

  test("a long turn says how many steps are shown on screen, and Copy recap writes every step of the turn", async () => {
    sync.messages = [{ id: "u1", role: "user" }, { id: "a1", role: "assistant" }]
    useWebMcpBrowserStore.getState().updateSnapshot({ catalog: [] })
    sync.parts = new Map([["a1", Array.from({ length: 60 }, (_, index) => call(`c${index}`, "completed"))]])
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => undefined)
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
    const { container } = render(<ReviewLandingBrowserEvidence directory="/repo" sessionId="s1" />)
    expect(container.querySelector("[data-recap-capped]")?.textContent).toBe("diffView.landing.browserRecap.capped:50|60")
    await act(async () => {
      fireEvent.click(container.querySelector<HTMLButtonElement>("[data-recap-copy]")!)
    })
    const text = writeText.mock.calls[0][0]
    expect(text.split("\n")).toHaveLength(63)
    expect(text).toContain("diffView.landing.browserRecap.unknownAssociation")
    expect(text).toContain("diffView.landing.browserEvidence:60")
    expect(text).not.toContain("diffView.landing.browserRecap.capped")
    expect(text).toContain("1. checkout")
    expect(text).toContain("60. checkout")
    expect(container.querySelector("ol")?.start).toBe(11)
  })
})

test("uncalled tool names and structured failures are redacted in the recap and clipboard", async () => {
  const secret = "ghp_" + "a".repeat(36)
  sync.messages = [{ id: "u1", role: "user" }, { id: "a1", role: "assistant" }]
  sync.parts = new Map([["a1", [{ ...call("bad", "completed"), state: {
    ...call("bad", "completed").state,
    output: JSON.stringify({ untrusted: true, result: { error: { field: "title", constraint: "required", token: secret } } }),
  } }]]])
  useWebMcpBrowserStore.setState({ views: {}, order: [], activeKey: null })
  useWebMcpBrowserStore.getState().updateSnapshot({ sessionID: "s1", origin: "https://shop.test",
    catalog: [nativeWebMcpTool({ name: "checkout", description: "Pay", inputSchema: {} }), nativeWebMcpTool({ name: secret, description: "Unused" })] })
  const writeText = vi.fn<(text: string) => Promise<void>>(async () => undefined)
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
  const { container } = render(<ReviewLandingBrowserEvidence directory="/repo" sessionId="s1" />)
  fireEvent.click(container.querySelector("summary")!)
  expect(container.querySelector("[data-recap-not-called]")?.textContent).toContain("[redacted]")
  expect(container.querySelector("[data-recap-result]")?.textContent).toContain("required")
  expect(container.querySelector("[data-recap-outcome]")?.getAttribute("data-recap-outcome")).toBe("failed")
  expect(container.innerHTML).not.toContain(secret)
  await act(async () => fireEvent.click(container.querySelector("[data-recap-copy]")!))
  expect(writeText.mock.calls[0][0]).toContain("required")
  expect(writeText.mock.calls[0][0]).not.toContain(secret)
})

test.each([false, true])("whole-turn evidence includes an early failure beyond call and message caps (spread: %s)", (spread) => {
  const early = call("early", "error")
  early.state.input.toolName = "complete_task"
  early.state.metadata.toolName = "complete_task"
  early.state.metadata.definitionDigest = nativeWebMcpTool({ name: "complete_task", description: "Complete" }).definitionDigest
  const successes = Array.from({ length: 205 }, (_, index) => {
    const part = call(`later-${index}`, "completed")
    part.state.input.toolName = "list_tasks"
    part.state.metadata.toolName = "list_tasks"
    part.state.metadata.definitionDigest = nativeWebMcpTool({ name: "list_tasks", description: "List" }).definitionDigest
    return part
  })
  sync.messages = [{ id: "previous", role: "assistant" }, { id: "user", role: "user" }, { id: "early", role: "assistant" },
    ...(spread ? successes.map((part) => ({ id: part.id, role: "assistant" })) : [{ id: "later", role: "assistant" }])]
  sync.parts = new Map([["previous", [call("previous-turn", "error")]], ["early", [early]],
    ...(spread ? successes.map((part): [string, unknown[]] => [part.id, [part]]) : [["later", successes] as [string, unknown[]]])])
  useWebMcpBrowserStore.setState({ views: {}, order: [], activeKey: null })
  useWebMcpBrowserStore.getState().updateSnapshot({ sessionID: "s1", catalog: [
    nativeWebMcpTool({ name: "complete_task", description: "Complete" }), nativeWebMcpTool({ name: "list_tasks", description: "List" }),
    nativeWebMcpTool({ name: "unused", description: "Unused" }),
  ] })
  const { container } = render(<ReviewLandingBrowserEvidence directory="/repo" sessionId="s1" />)
  expect(container.querySelector("[data-landing-browser-evidence]")?.textContent).toBe("diffView.landing.browserEvidenceFailed:206|1")
  expect(container.querySelectorAll("[data-recap-outcome]")).toHaveLength(50)
  expect(container.querySelector("[data-recap-capped]")?.textContent).toBe("diffView.landing.browserRecap.capped:50|206")
  expect(container.querySelector("[data-recap-not-called]")?.textContent).toBe("diffView.landing.browserRecap.notCalled:unused")
})

test("an unavailable initial directory snapshot renders no recap", () => {
  sync.unavailable = true
  expect(render(<ReviewLandingBrowserEvidence directory="/repo" sessionId="s1" />).container.innerHTML).toBe("")
})

test("recap and copied evidence distinguish two credential-shaped tools and attribute the agent call by key", async () => {
  const { credentialToolFixture } = await import("@/test/webMcpCatalog")
  const fixture = credentialToolFixture()
  const catalog = fixture.project()
  sync.messages = [{ id: "u", role: "user" }, { id: "a", role: "assistant" }]
  sync.parts = new Map([["a", [{ type: "tool", tool: "desktop_webmcp", state: {
    status: "completed", input: { action: "invoke", toolName: fixture.names[0] },
    metadata: { operation: "invoke", toolName: fixture.names[0], definitionDigest: catalog[0].definitionDigest }, output: "{}",
  } }]]])
  useWebMcpBrowserStore.getState().updateView(viewKeyFor("/repo", "s1"), {
    sessionID: "s1", directory: "/repo", origin: "https://tools.test", catalog,
  })
  useWebMcpBrowserStore.getState().updateView(viewKeyFor("/repo", "s1"), { catalog: fixture.project(true) })
  const { container } = render(<ReviewLandingBrowserEvidence directory="/repo" sessionId="s1" />)
  expect(container.querySelector("[data-landing-browser-evidence]")?.textContent).toBe("diffView.landing.browserEvidence:1|0")
  expect(container.querySelector("[data-recap-open]")?.textContent).toBe("[redacted tool 1]")
  expect(container.querySelector("[data-recap-not-called]")?.textContent).toBe("diffView.landing.browserRecap.notCalled:[redacted tool 2]")
  const writeText = vi.fn<(text: string) => Promise<void>>(async () => undefined)
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
  await act(async () => fireEvent.click(container.querySelector("[data-recap-copy]")!))
  expect(writeText.mock.calls[0][0]).toContain("1. [redacted tool 1]")
  expect(writeText.mock.calls[0][0]).toContain("notCalled:[redacted tool 2]")
  expect(container.innerHTML + writeText.mock.calls[0][0]).not.toMatch(/ghp_/)
})


test("evicted successful invocation stays successful and makes displayed and copied coverage unknown", async () => {
  const old = nativeWebMcpTool({ name: "add_task", description: "Original", inputSchema: {} })
  const store = useWebMcpBrowserStore.getState()
  store.updateSnapshot({ sessionID: "s1", origin: "https://tasks.test", catalog: [old] })
  for (let edit = 0; edit < 33; edit++) store.updateSnapshot({ catalog: [nativeWebMcpTool({ ...old, description: `Edit ${edit}` })] })
  expect(useWebMcpBrowserStore.getState().catalog[0].invocationID).toBe(old.invocationID)
  expect(useWebMcpBrowserStore.getState().registration).toHaveLength(32)
  sync.messages = [{ id: "u", role: "user" }, { id: "a", role: "assistant" }]
  sync.parts = new Map([["a", [{ type: "tool", tool: "desktop_webmcp", state: { status: "completed",
    metadata: { operation: "invoke", toolName: "add_task", definitionDigest: old.definitionDigest }, output: "created",
  } }]]])
  const writeText = vi.fn(async () => {})
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
  const { container } = render(<ReviewLandingBrowserEvidence directory="/repo" sessionId="s1" />)
  expect(container.querySelector('[data-recap-outcome="ok"]')).not.toBeNull()
  expect(container.querySelector('[data-recap-not-called]')).toBeNull()
  expect(container.querySelector('[data-recap-unknown-association]')).not.toBeNull()
  await act(async () => fireEvent.click(container.querySelector('[data-recap-copy]')!))
  expect(writeText).toHaveBeenCalledWith(expect.stringContaining("diffView.landing.browserRecap.unknownAssociation"))
  expect(writeText.mock.calls.flat().join(" ")).not.toContain("browserRecap.notCalled")
})

import { recordWebMcpApprovalReceipt, useWebMcpApprovalReceipts } from "@/stores/useWebMcpApprovalOutcome"
test("recap resolves approval-only receipts and shows structured runtime rejection details", () => {
  const definition = nativeWebMcpTool({ name: "echo", description: "Echo", inputSchema: { type: "object", properties: { count: { type: "integer" } } } })
  useWebMcpBrowserStore.getState().updateSnapshot({ sessionID: "s1", catalog: [definition] })
  recordWebMcpApprovalReceipt("s1", { permission: "webmcp", tool: { callID: "receipt" }, metadata: {
    definitionDigest: definition.definitionDigest, inputPreview: '{"count":"wrong"}',
  } })
  sync.messages = [{ id: "m1", role: "assistant" }]
  sync.parts = new Map([["m1", [{ type: "tool", tool: "desktop_webmcp", callID: "receipt", state: {
    status: "completed", input: { action: "invoke", toolName: "echo" }, metadata: { operation: "invoke" },
    output: JSON.stringify({ untrusted: true, result: { error: { field: "count", rule: "type", message: "must be integer" } } }),
  } }]]])
  const { container } = render(<ReviewLandingBrowserEvidence directory="/repo" sessionId="s1" />)
  expect(container.querySelector('[data-webmcp-diagnosis-property="count"]')?.getAttribute("data-webmcp-diagnosis-rule")).toBe("type")
  expect(container.querySelector('[data-webmcp-rejection-property="count"]')?.textContent).toContain("must be integer")
  expect(container.querySelector('[data-recap-definition]')?.getAttribute("title")).toBe(definition.definitionDigest)
  useWebMcpApprovalReceipts.setState({ receipts: new Map() })
})


test.each(["read", "act", "navigate", "list", "none"])("registered tools are listed as never called with only %s operations", async (operation) => {
  sync.messages = [{ id: "u", role: "user" }, { id: "a", role: "assistant" }]
  sync.parts = new Map([["a", operation === "none" ? [] : [{ id: "step", type: "tool", tool: "desktop_webmcp",
    state: { status: "completed", input: { action: operation }, metadata: { operation }, output: "{}" } }]]])
  useWebMcpBrowserStore.getState().updateSnapshot({ sessionID: "s1", origin: "https://tools.test",
    catalog: [nativeWebMcpTool({ name: "validate", description: "Validate", inputSchema: {} })] })
  const { container } = render(<ReviewLandingBrowserEvidence directory="/repo" sessionId="s1" />)
  expect(container.querySelector("[data-recap-not-called]")?.textContent).toBe("diffView.landing.browserRecap.notCalled:validate")
  const writeText = vi.fn(async () => {})
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
  await act(async () => fireEvent.click(container.querySelector("[data-recap-copy]")!))
  expect(writeText).toHaveBeenCalledWith(expect.stringContaining("diffView.landing.browserRecap.notCalled:validate"))
})
