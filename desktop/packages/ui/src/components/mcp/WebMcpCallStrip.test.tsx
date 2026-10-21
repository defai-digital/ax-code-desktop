import { afterEach, describe, expect, test, vi } from "vitest"
import { cleanup, fireEvent, render } from "@/test/dom"

const sync = vi.hoisted(() => ({
  messages: [] as unknown[],
  parts: new Map<string, unknown[]>(),
  permissions: [] as Array<{ id: string; tool?: { messageID: string; callID: string } }>,
}))
vi.mock("@/sync/sync-context", () => ({
  useSessionMessages: () => sync.messages,
  useSessionPermissions: () => sync.permissions,
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
import { WebMcpCallStrip } from "./WebMcpCallStrip"

const call = (id: string, generation: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: "tool",
  tool: "desktop_webmcp",
  state: {
    status: "completed",
    input: { action: "invoke", toolName: "add_task" },
    metadata: { operation: "invoke", toolName: "add_task", generation },
    time: { start: 0, end: 1250 },
    output: JSON.stringify({ untrusted: true, result: { ok: true } }),
    ...extra,
  },
})

afterEach(() => {
  cleanup()
  useWebMcpBrowserStore.getState().resetSnapshot()
  useUIStore.getState().setPendingMessageNavigation(null)
})

describe("WebMCP call strip", () => {
  test("rows show duration and result, mark calls on an earlier page, and open the call in the conversation", () => {
    sync.messages = [{ id: "m1" }, { id: "m2" }]
    sync.parts = new Map([
      ["m1", [call("old", "gen-1")]],
      ["m2", [call("new", "gen-2")]],
    ])
    useWebMcpBrowserStore.getState().updateSnapshot({ sessionID: "s1", generation: "gen-2" })
    const { container } = render(<WebMcpCallStrip sessionID="s1" directory="/repo" />)
    const rows = Array.from(container.querySelectorAll<HTMLElement>("[data-webmcp-call]"))
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain("1.3 s")
    expect(rows[0].querySelector("[data-webmcp-call-result]")?.textContent).toContain('"ok": true')
    expect(rows[0].querySelector("[data-webmcp-call-earlier]")).toBeNull()
    expect(rows[1].querySelector("[data-webmcp-call-earlier]")).not.toBeNull()
    fireEvent.click(rows[1].querySelector("button")!)
    expect(useUIStore.getState().pendingMessageNavigation).toEqual({ sessionId: "s1", messageId: "m1", partId: "old" })
  })

  test("another session's page generation never marks this session's calls", () => {
    sync.messages = [{ id: "m1" }]
    sync.parts = new Map([["m1", [call("only", "gen-1")]]])
    useWebMcpBrowserStore.getState().updateSnapshot({ sessionID: "other", generation: "gen-9" })
    const { container } = render(<WebMcpCallStrip sessionID="s1" directory="/repo" />)
    expect(container.querySelector("[data-webmcp-call-earlier]")).toBeNull()
  })

  test("a page-supplied tool name is capped and isolated", () => {
    sync.messages = [{ id: "m1" }]
    sync.parts = new Map([
      [
        "m1",
        [
          call("long", "gen-1", {
            input: { action: "invoke", toolName: "x".repeat(500) },
            metadata: { operation: "invoke", toolName: "x".repeat(500), generation: "gen-1" },
          }),
        ],
      ],
    ])
    const { container } = render(<WebMcpCallStrip sessionID="s1" directory="/repo" />)
    const name = container.querySelector<HTMLElement>("[data-webmcp-call] .font-mono")!
    expect(name.textContent!.length).toBeLessThanOrEqual(80)
    expect(name.style.unicodeBidi).toBe("isolate")
  })
})

test("call generation follows the requested pooled project/session even when another view is selected", async () => {
  const { viewKeyFor } = await import("@/lib/webMcpViewKey")
  const initial = useWebMcpBrowserStore.getState()
  const store = () => useWebMcpBrowserStore.getState()
  try {
    sync.messages = [{ id: "m1" }]
    sync.parts = new Map([["m1", [call("only", "gen-1")]]])
    store().selectView("/repo", "s1")
    store().updateSnapshot({ generation: "gen-2" })
    store().selectView("/other", "s1")
    store().updateSnapshot({ generation: "gen-1" })
    const view = render(<WebMcpCallStrip sessionID="s1" directory="/repo" />)
    expect(view.container.querySelector("[data-webmcp-call-earlier]")).not.toBeNull()
    expect(store().views[viewKeyFor("/repo", "s1")].generation).toBe("gen-2")
    view.rerender(<WebMcpCallStrip sessionID="s1" directory="/other" />)
    expect(view.container.querySelector("[data-webmcp-call-earlier]")).toBeNull()
  } finally {
    cleanup()
    useWebMcpBrowserStore.setState(initial, true)
  }
})

describe("WebMCP call strip approvals", () => {
  test("a running call with a pending approval links to that approval card and focuses its first answer", () => {
    sync.messages = [{ id: "m1" }]
    sync.parts = new Map([
      ["m1", [{ ...call("live", "gen-1"), callID: "call-7", state: { status: "running", input: { action: "invoke", toolName: "add_task" }, metadata: { operation: "invoke", toolName: "add_task" } } }]],
    ])
    sync.permissions = [{ id: "per_9", tool: { messageID: "m1", callID: "call-7" } }]
    const card = document.createElement("div")
    card.setAttribute("data-permission-id", "per_9")
    const answer = document.createElement("button")
    card.append(answer)
    card.scrollIntoView = vi.fn()
    document.body.append(card)
    const { container } = render(<WebMcpCallStrip sessionID="s1" directory="/repo" />)
    fireEvent.click(container.querySelector<HTMLButtonElement>("[data-webmcp-call-approval]")!)
    expect(card.scrollIntoView).toHaveBeenCalled()
    expect(document.activeElement).toBe(answer)
    card.remove()
    sync.permissions = []
  })

  test("a call without a pending approval offers no approval link", () => {
    sync.messages = [{ id: "m1" }]
    sync.parts = new Map([["m1", [call("done", "gen-1")]]])
    sync.permissions = [{ id: "per_9", tool: { messageID: "m1", callID: "other" } }]
    const { container } = render(<WebMcpCallStrip sessionID="s1" directory="/repo" />)
    expect(container.querySelector("[data-webmcp-call-approval]")).toBeNull()
    sync.permissions = []
  })
})

test("structured application failures keep their redacted explanation without metadata.reason", () => {
  const secret = "ghp_" + "b".repeat(36)
  sync.messages = [{ id: "m1" }]
  sync.parts = new Map([["m1", [call("bad", "gen-1", {
    output: JSON.stringify({ untrusted: true, result: { error: { field: "title", constraint: "required", token: secret } } }),
  })]]])
  const { container } = render(<WebMcpCallStrip sessionID="s1" directory="/repo" />)
  expect(container.querySelector("[data-webmcp-call='failed']")).not.toBeNull()
  expect(container.querySelector("[data-webmcp-call-result]")?.textContent).toContain("required")
  expect(container.querySelector("[data-webmcp-call-result]")?.textContent).toContain("[redacted]")
  expect(container.innerHTML).not.toContain(secret)
})

import { recordWebMcpApproval, useWebMcpApprovalOutcomes } from "@/stores/useWebMcpApprovalOutcome"
test.each([false, true])("disappearing approval records an outcome unless answered (%s)", (answered) => {
  useWebMcpApprovalOutcomes.setState({ calls: new Map() })
  sync.messages = [{ id: "m1" }]
  sync.parts = new Map([["m1", [{ ...call("expired", "gen-1"), callID: "expired-call", state: { status: "running", input: { action: "invoke", toolName: "echo" } } }]]])
  sync.permissions = [{ id: "per_expired", tool: { messageID: "m1", callID: "expired-call" } }]
  const view = render(<WebMcpCallStrip sessionID="s1" directory="/repo" />)
  if (answered) recordWebMcpApproval("s1", "expired-call", "answered")
  sync.permissions = []
  view.rerender(<WebMcpCallStrip sessionID="s1" directory="/repo" />)
  expect(Boolean(view.container.querySelector("[data-webmcp-approval-unanswered]"))).toBe(!answered)
  useWebMcpApprovalOutcomes.setState({ calls: new Map() })
})

test("call strip uses the main label for a credential-shaped runtime call", async () => {
  const { credentialToolFixture } = await import("@/test/webMcpCatalog")
  const fixture = credentialToolFixture()
  const catalog = fixture.project()
  useWebMcpBrowserStore.getState().updateSnapshot({ sessionID: "s1", origin: "https://tools.test", catalog })
  sync.messages = [{ id: "m" }]
  sync.parts = new Map([["m", [call("called", "gen-1", {
    input: { action: "invoke", toolName: fixture.names[1] },
    metadata: { operation: "invoke", toolName: fixture.names[1], definitionDigest: catalog[1].definitionDigest },
  })]]])
  const { container } = render(<WebMcpCallStrip sessionID="s1" directory="/repo" />)
  expect(container.querySelector("[data-webmcp-call='ok']")?.textContent).toContain("[redacted tool 2]")
  expect(container.innerHTML).not.toMatch(/ghp_/)
})
