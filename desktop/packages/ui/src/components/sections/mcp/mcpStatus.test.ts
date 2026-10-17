import { describe, expect, test } from "vitest"
import { getStatusDescription, shouldShowFullStatusCard, statusCardClass } from "./mcpStatus"

const t = (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key)

describe("MCP runtime status presentation", () => {
  test("explains an untrusted project server and names it for the CLI command", () => {
    expect(getStatusDescription("needs_trust", t, undefined, "elicit-check")).toBe(
      'settings.mcp.page.status.description.needsTrust:{"name":"elicit-check"}',
    )
  })

  test("shows the untrusted state as a warning card, like a server that needs authorization", () => {
    expect(statusCardClass("needs_trust")).toBe(statusCardClass("needs_auth"))
    expect(shouldShowFullStatusCard("needs_trust", null, false, false)).toBe(true)
  })

  test("keeps the existing states unchanged", () => {
    expect(getStatusDescription("failed", t, "  boom  ")).toBe("boom")
    expect(getStatusDescription("connected", t)).toBe("settings.mcp.page.status.description.connected")
    expect(getStatusDescription(undefined, t)).toBe("settings.mcp.page.status.description.default")
    expect(shouldShowFullStatusCard("connected", null, false, false)).toBe(false)
  })
})
