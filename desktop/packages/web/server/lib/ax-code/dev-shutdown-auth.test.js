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
    getHealthSnapshot: () => ({ status: "ok" }),
    openchamberVersion: "1.0.0",
    runtimeName: "test",
    process: { env: { AX_CODE_DESKTOP_DEV_SHUTDOWN: "true" } },
  })
  return app
}

describe("dev shutdown requires the UI session", () => {
  it("refuses an unauthenticated caller even with the dev flag on", async () => {
    const requireAuth = vi.fn((_req, res) => res.status(401).json({ error: "UI authentication required" }))
    const app = buildApp({ authController: { requireAuth } })

    const response = await request(app)
      .post("/api/system/dev-shutdown")
      .set("origin", "http://127.0.0.1:4096")
      .set("host", "127.0.0.1:4096")
      .agent(false)

    expect(response.status).toBe(401)
    expect(requireAuth).toHaveBeenCalledTimes(1)
  })

  it("proceeds for an authenticated caller", async () => {
    const requireAuth = vi.fn((_req, _res, next) => next())
    const app = buildApp({ authController: { requireAuth } })

    const response = await request(app)
      .post("/api/system/dev-shutdown")
      .set("origin", "http://127.0.0.1:4096")
      .set("host", "127.0.0.1:4096")
      .agent(false)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true })
  })
})
