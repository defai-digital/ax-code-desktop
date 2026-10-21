import { afterEach, describe, expect, test, vi } from "vitest"
import { nativeWebMcpTool } from "@/test/webMcpCatalog"
import { act } from "react"
import { cleanup, fireEvent, render } from "@/test/dom"

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
import { useUIStore } from "@/stores/useUIStore"
import { useWebMcpBrowserStore } from "@/stores/useWebMcpBrowserStore"
import { viewKeyFor } from "@/lib/webMcpViewKey"
import { ReviewLandingBrowserEvidence } from "./ReviewLandingBrowserEvidence"

const call = (id: string, status: string) => ({
  id,
  type: "tool",
  tool: "desktop_webmcp",
  state: { status, input: { action: "invoke", toolName: "checkout" }, metadata: { operation: "invoke", toolName: "checkout" } },
})

afterEach(() => {
  cleanup()
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
        { name: "checkout", description: "Pay", inputSchema: {} },
        { name: "apply_coupon", description: "Apply a coupon", inputSchema: {} },
      ],
    })
    const { container } = render(<ReviewLandingBrowserEvidence directory="/repo" sessionId="s1" />)
    const steps = Array.from(container.querySelectorAll("[data-recap-outcome]"), (step) => step.textContent)
    expect(steps).toEqual([
      "read · diffView.landing.browserRecap.kind.read · webmcp.calls.outcome.ok",
      "checkout · diffView.landing.browserRecap.kind.invoke · webmcp.calls.outcome.ok",
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

  test.each(["same", "changed", "frame", "missing"])("recap compares native definition identities: %s", (change) => {
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
      sessionID: "s1",
      directory: "/repo",
      origin: "https://shop.test",
      catalog: [current],
    })
    const { container } = render(<ReviewLandingBrowserEvidence directory="/repo" sessionId="s1" />)
    const step = container.querySelector("[data-recap-outcome]")!
    expect(step.textContent).toContain("1.5 s")
    expect(step.querySelector("[data-recap-result]")?.textContent).toContain('"paid": true')
    expect(step.querySelector("[data-recap-definition]")?.getAttribute("title")).toBe(original.definitionDigest)
    expect(Boolean(step.querySelector("[data-recap-definition-changed]"))).toBe(change === "changed" || change === "frame")
    fireEvent.click(step.querySelector<HTMLButtonElement>("[data-recap-open]")!)
    expect(useUIStore.getState().pendingMessageNavigation).toEqual({ sessionId: "s1", messageId: "a1", partId: "prt_1" })
    useUIStore.getState().setPendingMessageNavigation(null)
  })

  test("a long turn says how many steps are shown, and Copy recap writes the steps to the clipboard", async () => {
    sync.messages = [{ id: "u1", role: "user" }, { id: "a1", role: "assistant" }]
    sync.parts = new Map([["a1", Array.from({ length: 60 }, (_, index) => call(`c${index}`, "completed"))]])
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => undefined)
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
    const { container } = render(<ReviewLandingBrowserEvidence directory="/repo" sessionId="s1" />)
    expect(container.querySelector("[data-recap-capped]")?.textContent).toBe("diffView.landing.browserRecap.capped:50|60")
    await act(async () => {
      fireEvent.click(container.querySelector<HTMLButtonElement>("[data-recap-copy]")!)
    })
    const text = writeText.mock.calls[0][0]
    expect(text.split("\n")).toHaveLength(51)
    expect(text).toContain("1. checkout")
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
    catalog: [{ name: "checkout", description: "Pay" }, { name: secret, description: "Unused" }] })
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
