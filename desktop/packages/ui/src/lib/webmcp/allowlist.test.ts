import { describe, expect, test } from "vitest"
import type { WebMcpApprovalRecord } from "@defai-digital/ax-code-sdk/v2"

import {
  buildGrantScopes,
  describeWebMcpScope,
  grantRowsForOrigin,
  grantableOrigin,
  sortWebMcpApprovals,
  webMcpAllowlistErrorKey,
  webMcpAllowlistErrorReason,
  webMcpAllowlistScopeTitle,
} from "./allowlist"

const record = (scope: WebMcpApprovalRecord["scope"], id = "a".repeat(64)): WebMcpApprovalRecord => ({
  server: "bridge",
  project: "project",
  scope,
  id,
  fingerprint: "b".repeat(64),
  revision: "00000000-0000-4000-8000-000000000000",
  policyVersion: 1,
  createdAt: 0,
})

describe("grantableOrigin", () => {
  test("accepts https origins and normalises default ports and paths", () => {
    expect(grantableOrigin("https://example.com")).toBe("https://example.com")
    expect(grantableOrigin("https://example.com:443/")).toBe("https://example.com")
    expect(grantableOrigin(" https://example.com/some/page?q=1 ")).toBe("https://example.com")
    expect(grantableOrigin("https://example.com:8443")).toBe("https://example.com:8443")
  })

  test("accepts http on loopback hosts with an optional port", () => {
    expect(grantableOrigin("http://localhost")).toBe("http://localhost")
    expect(grantableOrigin("http://localhost:5173")).toBe("http://localhost:5173")
    expect(grantableOrigin("http://127.0.0.1:8080")).toBe("http://127.0.0.1:8080")
    expect(grantableOrigin("http://[::1]:3000")).toBe("http://[::1]:3000")
  })

  test("rejects plain http, credentials, wildcards and malformed values", () => {
    expect(grantableOrigin("http://example.com")).toBeUndefined()
    expect(grantableOrigin("https://user:pass@example.com")).toBeUndefined()
    expect(grantableOrigin("https://*.example.com")).toBeUndefined()
    expect(grantableOrigin("https://example.com/*")).toBeUndefined()
    expect(grantableOrigin("")).toBeUndefined()
    expect(grantableOrigin("not a url")).toBeUndefined()
    expect(grantableOrigin("blob:https://example.com")).toBeUndefined()
  })
})

describe("sortWebMcpApprovals", () => {
  test("orders by origin then capability, listing first", () => {
    const rows = sortWebMcpApprovals([
      record({ capability: "close", origin: "https://b.test" }),
      record({ capability: "navigate", origin: "https://b.test" }),
      record({ capability: "read", origin: "https://a.test" }),
      record({ capability: "list_pages" }),
      record({ capability: "navigate", origin: "https://a.test" }),
    ])
    expect(rows.map((row) => row.scope)).toEqual([
      { capability: "list_pages" },
      { capability: "navigate", origin: "https://a.test" },
      { capability: "read", origin: "https://a.test" },
      { capability: "navigate", origin: "https://b.test" },
      { capability: "close", origin: "https://b.test" },
    ])
  })

  test("does not mutate the input", () => {
    const input = [record({ capability: "read", origin: "https://a.test" }), record({ capability: "list_pages" })]
    sortWebMcpApprovals(input)
    expect(input[0].scope.capability).toBe("read")
  })
})

describe("buildGrantScopes", () => {
  test("offers one row per origin capability plus list_pages", () => {
    expect(grantRowsForOrigin("https://example.com")).toEqual([
      { capability: "list_pages" },
      { capability: "navigate", origin: "https://example.com" },
      { capability: "read", origin: "https://example.com" },
      { capability: "close", origin: "https://example.com" },
    ])
  })

  test("honours the selected capabilities and needs no origin for list_pages", () => {
    expect(buildGrantScopes({ originInput: "", capabilities: ["list_pages", "read"] })).toEqual([
      { capability: "list_pages" },
    ])
    expect(buildGrantScopes({ originInput: "http://localhost:3000", capabilities: ["read"] })).toEqual([
      { capability: "read", origin: "http://localhost:3000" },
    ])
  })

  test("never offers a scope that is already saved", () => {
    const existing = [
      record({ capability: "read", origin: "https://example.com" }),
      record({ capability: "list_pages" }),
    ]
    expect(grantRowsForOrigin("https://example.com", existing)).toEqual([
      { capability: "navigate", origin: "https://example.com" },
      { capability: "close", origin: "https://example.com" },
    ])
  })

  test("offers no origin rows for an ungrantable value", () => {
    expect(buildGrantScopes({ originInput: "http://example.com", capabilities: ["navigate"] })).toEqual([])
  })
})

describe("describeWebMcpScope", () => {
  test("describes origin and listing scopes", () => {
    expect(describeWebMcpScope({ capability: "read", origin: "https://a.test" })).toMatchObject({
      capability: "read",
      origin: "https://a.test",
    })
    expect(describeWebMcpScope({ capability: "list_pages" }).origin).toBeNull()
    expect(webMcpAllowlistScopeTitle({ capability: "list_pages" })).toBe("List all browser pages")
    expect(webMcpAllowlistScopeTitle({ capability: "read", origin: "https://a.test" })).toBe("read: https://a.test")
  })
})

describe("webMcpAllowlistErrorKey", () => {
  test("maps runtime reasons to message keys", () => {
    expect(webMcpAllowlistErrorKey({ status: 400, details: { reason: "not_connected" } })).toBe(
      "webmcp.allowlist.error.notConnected",
    )
    expect(webMcpAllowlistErrorKey({ status: 404, message: "not a WebMCP bridge" })).toBe(
      "webmcp.allowlist.error.notWebMcp",
    )
    expect(webMcpAllowlistErrorKey({ data: { reason: "not_webmcp" } })).toBe("webmcp.allowlist.error.notWebMcp")
    expect(webMcpAllowlistErrorKey(new Error('{"reason":"rejected","message":"denied"}'))).toBe(
      "webmcp.allowlist.error.rejected",
    )
    expect(webMcpAllowlistErrorKey(new Error("boom"))).toBe("webmcp.allowlist.error.generic")
    expect(webMcpAllowlistErrorKey(undefined)).toBe("webmcp.allowlist.error.generic")
  })
})

describe("webMcpAllowlistErrorReason", () => {
  test("keeps a free-text refusal out of the rejected verdict", () => {
    // A message is prose: matching "rejected" in it called any unrelated refusal "the grant was
    // rejected", which the message never said. The structured fields still carry the verdict.
    expect(webMcpAllowlistErrorReason(new Error("proxy rejected the connection"))).toBe("other")
    expect(webMcpAllowlistErrorReason({ reason: "rejected" })).toBe("rejected")
    expect(webMcpAllowlistErrorReason(new Error("not_webmcp"))).toBe("not_webmcp")
  })
})
