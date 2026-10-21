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

const call = (id: string, status: string) => ({
  id,
  type: "tool",
  tool: "desktop_webmcp",
  state: { status, input: { action: "invoke", toolName: "checkout" }, metadata: { operation: "invoke", toolName: "checkout" } },
})

afterEach(() => cleanup())

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
})
