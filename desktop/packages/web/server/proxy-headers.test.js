import { describe, expect, it } from "vitest"

import {
  applyForwardProxyResponseHeaders,
  collectForwardProxyHeaders,
  shouldForwardProxyResponseHeader,
} from "./proxy-headers.js"

describe("ax-code proxy header handling", () => {
  it("drops accept-encoding from forwarded request headers", () => {
    const headers = collectForwardProxyHeaders({
      accept: "application/json",
      "accept-encoding": "gzip, deflate, br",
      connection: "keep-alive",
    })

    expect(headers.accept).toBe("application/json")
    expect(headers["accept-encoding"]).toBeUndefined()
  })

  it("replaces a client's authorization header with the runtime credential", () => {
    // Headers init keeps `authorization` and `Authorization` as separate entries and joins
    // them, so the runtime received "Bearer client, Basic server" and rejected the request.
    const headers = collectForwardProxyHeaders({ authorization: "Bearer client" }, { Authorization: "Basic server" })

    expect(new Headers(headers).get("authorization")).toBe("Basic server")
  })

  it("drops content-encoding from forwarded response headers", () => {
    expect(shouldForwardProxyResponseHeader("content-encoding")).toBe(false)
    expect(shouldForwardProxyResponseHeader("Content-Encoding")).toBe(false)
  })

  it("drops transfer-encoding from forwarded response headers", () => {
    expect(shouldForwardProxyResponseHeader("transfer-encoding")).toBe(false)
    expect(shouldForwardProxyResponseHeader("Transfer-Encoding")).toBe(false)
  })

  it("still keeps ordinary response headers", () => {
    expect(shouldForwardProxyResponseHeader("content-type")).toBe(true)
    expect(shouldForwardProxyResponseHeader("etag")).toBe(true)
  })

  it("applies upstream response headers to express response without content-encoding", () => {
    const applied = []
    const response = {
      setHeader(key, value) {
        applied.push([key, value])
      },
    }

    applyForwardProxyResponseHeaders(
      new Headers({
        "content-type": "application/json",
        etag: 'W/"abc"',
        "content-encoding": "gzip",
      }),
      response,
    )

    expect(applied).toEqual([
      ["content-type", "application/json"],
      ["etag", 'W/"abc"'],
    ])
  })
})
