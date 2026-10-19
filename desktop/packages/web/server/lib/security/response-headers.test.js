import { describe, expect, it } from "vitest"

import {
  applyPackagedRendererCorsHeaders,
  applySecurityHeaders,
  buildWebServerCsp,
  isDashboardProxyRequest,
  isPreviewProxyRequest,
} from "./response-headers.js"
import { createMockResponse } from "../../test-helpers/route-harness.js"

describe("response security headers", () => {
  it("sets X-Frame-Options for ordinary routes", () => {
    const res = createMockResponse()
    applySecurityHeaders({ path: "/" }, res)

    expect(res.getHeader("X-Frame-Options")).toBe("DENY")
    expect(res.getHeader("X-Content-Type-Options")).toBe("nosniff")
  })

  it("does not set X-Frame-Options on preview proxy responses", () => {
    const res = createMockResponse()
    applySecurityHeaders({ path: "/api/preview/proxy/abc123/" }, res)

    expect(res.getHeader("X-Frame-Options")).toBeUndefined()
    expect(res.getHeader("X-Content-Type-Options")).toBe("nosniff")
  })

  it("does not set X-Frame-Options on dashboard proxy responses", () => {
    const res = createMockResponse()
    applySecurityHeaders({ path: "/dre-graph/session/session-1" }, res)
    expect(res.getHeader("X-Frame-Options")).toBeUndefined()

    const runReport = createMockResponse()
    applySecurityHeaders({ path: "/run-report/session/session-1" }, runReport)
    expect(runReport.getHeader("X-Frame-Options")).toBeUndefined()
    expect(res.getHeader("X-Content-Type-Options")).toBe("nosniff")
  })

  it("allows models.dev provider logos in img-src", () => {
    const res = createMockResponse()
    applySecurityHeaders({ path: "/" }, res)

    expect(res.getHeader("Content-Security-Policy")).toContain("img-src 'self' data: blob: https://models.dev")
  })

  it("serves the app document without JavaScript eval", () => {
    const res = createMockResponse()
    applySecurityHeaders({ path: "/" }, res)
    const csp = res.getHeader("Content-Security-Policy")
    expect(csp).toContain("script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval';")
    expect(csp).not.toContain("'unsafe-eval'")
  })

  it("keeps the previous script allowance for proxied preview and dashboard pages", () => {
    for (const path of ["/api/preview/proxy/abc123/", "/dre-graph/session/s1", "/run-report/session/s1"]) {
      expect(buildWebServerCsp({ path })).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval';")
    }
    expect(buildWebServerCsp({ path: "/assets/main.js" })).not.toContain("'unsafe-eval'")
  })

  it("adds credentialed CORS headers for the packaged app:// renderer", () => {
    const res = createMockResponse()
    expect(
      applyPackagedRendererCorsHeaders(
        {
          headers: { origin: "app://ax-code" },
        },
        res,
      ),
    ).toBe(true)
    expect(res.getHeader("Access-Control-Allow-Origin")).toBe("app://ax-code")
    expect(res.getHeader("Access-Control-Allow-Credentials")).toBe("true")
    const allowed = res.getHeader("Access-Control-Allow-Headers").toLowerCase().split(/,\s*/)
    // Both headers are emitted by the pinned SDK's directory-scoped client.
    expect(allowed).toEqual(expect.arrayContaining(["content-type", "x-ax-code-directory", "x-opencode-directory"]))
    // The SSE transport's reconnect cursor must survive the preflight too.
    expect(allowed).toEqual(expect.arrayContaining(["last-event-id", "cache-control"]))
    expect(
      applyPackagedRendererCorsHeaders(
        {
          headers: { origin: "http://example.com" },
        },
        res,
      ),
    ).toBe(false)
  })

  it("recognizes preview proxy requests from originalUrl when path is unavailable", () => {
    expect(isPreviewProxyRequest({ originalUrl: "/api/preview/proxy/abc123/?ocPreview=1" })).toBe(true)
  })

  it("recognizes dashboard proxy requests from originalUrl when path is unavailable", () => {
    expect(isDashboardProxyRequest({ originalUrl: "/dre-graph?directory=/workspace/project" })).toBe(true)
    expect(isDashboardProxyRequest({ originalUrl: "/run-report/session/session-1?directory=/workspace/project" })).toBe(
      true,
    )
  })
})
