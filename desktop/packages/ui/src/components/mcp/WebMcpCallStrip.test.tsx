import { afterEach, describe, expect, test, vi } from "vitest"
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
    expect(useUIStore.getState().pendingMessageNavigation).toEqual({ sessionId: "s1", messageId: "m1" })
  })

  test("another session's page generation never marks this session's calls", () => {
    sync.messages = [{ id: "m1" }]
    sync.parts = new Map([["m1", [call("only", "gen-1")]]])
    useWebMcpBrowserStore.getState().updateSnapshot({ sessionID: "other", generation: "gen-9" })
    const { container } = render(<WebMcpCallStrip sessionID="s1" directory="/repo" />)
    expect(container.querySelector("[data-webmcp-call-earlier]")).toBeNull()
  })
})
