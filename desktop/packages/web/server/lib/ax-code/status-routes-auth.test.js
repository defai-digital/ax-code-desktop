import express from "express"
import { describe, expect, it, vi } from "vitest"
import request from "supertest"

import { registerServerStatusRoutes } from "./core-routes.js"

const buildApp = ({ authController }) => {
  const app = express()
  registerServerStatusRoutes(app, {
    express,
    uiAuthController: authController,
    gracefulShutdown: vi.fn(),
    getHealthSnapshot: () => ({
      axCodeBinaryResolved: "/usr/local/bin/ax-code",
      axCodeLaunchArgs: ["--port", "4096"],
    }),
    getStartupDiagnosticsSnapshot: () => ({ bootId: "boot-a", events: [] }),
    openchamberVersion: "1.0.0",
    runtimeName: "test",
    process: { env: {}, pid: 1234 },
  })
  return app
}

const createController = ({ authorized }) => ({
  requireAuth: vi.fn((_req, res, next) => {
    if (authorized) {
      next()
      return
    }
    res.status(401).json({ error: "UI authentication required", locked: true })
  }),
  // Mirrors the real controller: reports the token (or null) without responding.
  ensureSessionToken: vi.fn(async () => (authorized ? "session-token" : null)),
})

describe("status routes and the UI session", () => {
  const gatedRoutes = [
    ["get", "/api/desktop/diagnostics/startup"],
    ["get", "/api/system/info"],
    ["get", "/api/system/free-port"],
  ]

  it.each(gatedRoutes)("refuses an unauthenticated %s %s", async (method, path) => {
    const app = buildApp({ authController: createController({ authorized: false }) })

    const response = await request(app)[method](path).agent(false)

    expect(response.status).toBe(401)
  })

  it.each(gatedRoutes)("serves an authenticated %s %s", async (method, path) => {
    const app = buildApp({ authController: createController({ authorized: true }) })

    const response = await request(app)[method](path).agent(false)

    expect(response.status).toBe(200)
  })

  it("keeps /health public but minimal for unauthenticated probes", async () => {
    const app = buildApp({ authController: createController({ authorized: false }) })

    const response = await request(app).get("/health").agent(false)

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ status: "ok" })
    // The detailed snapshot carries absolute binary paths and launch arguments.
    expect(response.body).not.toHaveProperty("axCodeBinaryResolved")
  })

  it("serves the detailed health snapshot to an authenticated caller", async () => {
    const app = buildApp({
      authController: {
        requireAuth: vi.fn((_req, _res, next) => next()),
        ensureSessionToken: vi.fn(async () => "session-token"),
      },
    })

    const response = await request(app).get("/health").agent(false)

    expect(response.status).toBe(200)
    expect(response.body).toHaveProperty("axCodeBinaryResolved", "/usr/local/bin/ax-code")
    expect(response.body).toHaveProperty("axCodeLaunchArgs")
  })

  it("serves the status routes when no password is configured", async () => {
    const app = buildApp({ authController: null })

    const response = await request(app).get("/api/system/info").agent(false)

    expect(response.status).toBe(200)
  })
})

describe("bare proxy surfaces require the UI session", () => {
  const buildProxyApp = async ({ authorized }) => {
    const app = express()
    const { registerAuthAndAccessRoutes } = await import("./core-routes.js")
    registerAuthAndAccessRoutes(app, {
      express,
      uiAuthController: createController({ authorized }),
    })
    // The proxy itself is registered after the bootstrap; a plain handler is
    // enough to prove the guard runs first.
    app.get("/global/event", (_req, res) => res.json({ streamed: true }))
    app.get("/run-report", (_req, res) => res.json({ panel: true }))
    app.get("/dre-graph/x", (_req, res) => res.json({ panel: true }))
    return app
  }

  it.each(["/global/event", "/run-report", "/dre-graph/x"])("refuses an unauthenticated %s", async (path) => {
    const app = await buildProxyApp({ authorized: false })

    const response = await request(app).get(path).agent(false)

    expect(response.status).toBe(401)
  })

  it.each(["/global/event", "/run-report"])("serves an authenticated %s", async (path) => {
    const app = await buildProxyApp({ authorized: true })

    const response = await request(app).get(path).agent(false)

    expect(response.status).toBe(200)
  })
})
