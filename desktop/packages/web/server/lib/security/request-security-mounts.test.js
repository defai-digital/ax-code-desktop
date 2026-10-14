import fs from "node:fs"
import path from "node:path"
import { describe, expect, it, vi } from "vitest"

import { createApiRequestSecurityMiddleware } from "../ax-code/core-routes.js"

const createResponse = () => {
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.body = payload
      return this
    },
  }
  return res
}

const invoke = (req) => {
  const res = createResponse()
  const next = vi.fn()
  createApiRequestSecurityMiddleware()(req, res, next)
  return { res, next }
}

describe("api request security middleware", () => {
  it("allows a loopback GET", () => {
    const { next, res } = invoke({ method: "GET", headers: { host: "127.0.0.1:4096" } })

    expect(next).toHaveBeenCalledTimes(1)
    expect(res.statusCode).toBe(200)
  })

  it("rejects a request whose Host is not loopback (DNS rebinding)", () => {
    // The middleware is mounted on /health and /auth as well as /api, so this
    // also covers the health snapshot and the login endpoints.
    const { next, res } = invoke({ method: "GET", headers: { host: "evil.example.com" } })

    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(403)
  })

  it("rejects a cross-site POST even from a loopback Host", () => {
    const { res } = invoke({
      method: "POST",
      headers: { host: "127.0.0.1:4096", origin: "https://evil.example.com" },
    })

    expect(res.statusCode).toBe(403)
  })

  it("allows a loopback-origin POST", () => {
    const { next } = invoke({
      method: "POST",
      headers: { host: "127.0.0.1:4096", origin: "http://127.0.0.1:4096" },
    })

    expect(next).toHaveBeenCalledTimes(1)
  })
})

describe("api request security middleware mounts", () => {
  it("guards /api, /auth and /health before any route handler", () => {
    const source = fs.readFileSync(path.resolve(import.meta.dirname, "../../index.js"), "utf8")

    const mounts = [
      'app.use("/api"',
      'app.use("/auth"',
      'app.use("/health"',
      // The bare proxy surfaces also inject the runtime credential.
      'app.use(["/global", "/dre-graph", "/run-report", "/graph"]',
    ]

    for (const mount of mounts) {
      const index = source.indexOf(mount)
      expect(index, `${mount} must be mounted`).toBeGreaterThan(-1)
      expect(source.slice(index, index + 180)).toContain("createApiRequestSecurityMiddleware()")
    }
  })
})
