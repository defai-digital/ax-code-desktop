import { describe, expect, it, vi } from "vitest"

import { registerNotificationRoutes } from "./lib/notifications/routes.js"
import { createMockRequest, createMockResponse, createRouteRegistry } from "./test-helpers/route-harness.js"

describe("local SSE routes", () => {
  it("serves notification SSE with nginx-safe headers", async () => {
    const { app, getRoute } = createRouteRegistry()
    const clients = new Set()

    registerNotificationRoutes(app, {
      uiAuthController: {
        ensureSessionToken: async () => "ui-token",
      },
      getUiSessionTokenFromRequest: () => "ui-token",
      getUiNotificationClients: () => clients,
      writeSseEvent(res, payload) {
        res.write(`data: ${JSON.stringify(payload)}\n\n`)
      },
    })

    const handler = getRoute("GET", "/api/notifications/stream")
    const req = createMockRequest()
    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(res.getHeader("content-type")).toContain("text/event-stream")
    expect(res.getHeader("cache-control")).toBe("no-cache, no-transform")
    expect(res.getHeader("connection")).toBe("keep-alive")
    expect(res.getHeader("x-accel-buffering")).toBe("no")
    expect(res.flushed).toBe(true)
    expect(res.body).toContain("openchamber:notification-stream-ready")
    expect(clients.has(res)).toBe(true)

    req.emit("close")
    expect(clients.has(res)).toBe(false)
  })

  it("keeps a client that disconnected during the watcher start out of the set", async () => {
    // Both awaits before the client is added can take seconds on the first call, and `req.on("close")` is attached
    // after them: a client that disconnected in that window had already fired "close", so its response stayed in
    // the client set with a live heartbeat interval and every later broadcast wrote to a dead socket.
    const { app, getRoute } = createRouteRegistry()
    const clients = new Set()
    let releaseWatcher = () => {}

    registerNotificationRoutes(app, {
      uiAuthController: {
        ensureSessionToken: async () => "ui-token",
      },
      getUiSessionTokenFromRequest: () => "ui-token",
      getUiNotificationClients: () => clients,
      writeSseEvent(res, payload) {
        res.write(`data: ${JSON.stringify(payload)}\n\n`)
      },
      ensureGlobalWatcherStarted: () =>
        new Promise((resolve) => {
          releaseWatcher = () => resolve()
        }),
    })

    const handler = getRoute("GET", "/api/notifications/stream")
    const req = createMockRequest()
    const res = createMockResponse()

    vi.useFakeTimers()
    try {
      const pending = handler(req, res)
      // The client is gone while the watcher start is still in flight, and its "close" fired before the handler
      // reached the point where it listens for one.
      req.emit("close")
      req.destroyed = true
      releaseWatcher()
      await pending

      expect(clients.has(res)).toBe(false)
      expect(res.body ?? "").not.toContain("notification-stream-ready")
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it("answers an unauthenticated stream request instead of leaving the socket open", async () => {
    const { app, getRoute } = createRouteRegistry()
    const clients = new Set()

    registerNotificationRoutes(app, {
      // The password-configured controller refuses by returning null and writes nothing itself.
      uiAuthController: { ensureSessionToken: async () => null },
      getUiSessionTokenFromRequest: () => null,
      getUiNotificationClients: () => clients,
      writeSseEvent() {},
    })

    const handler = getRoute("GET", "/api/notifications/stream")
    const req = createMockRequest()
    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ error: "UI authentication required" })
    expect(clients.has(res)).toBe(false)
  })
})
