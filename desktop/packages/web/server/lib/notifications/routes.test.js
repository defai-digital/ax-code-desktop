import express from "express"
import request from "supertest"
import { describe, expect, it, vi } from "vitest"

import { registerNotificationRoutes } from "./routes.js"

const registerWith = (app, { authorized }) => {
  const uiAuthController = {
    // Mirrors the real controller: null when a password is configured and the request carries no valid
    // session cookie, a token otherwise.
    ensureSessionToken: vi.fn(async () => (authorized ? "session-token" : null)),
  }
  registerNotificationRoutes(app, {
    uiAuthController,
    ensureGlobalWatcherStarted: vi.fn(async () => {}),
    getUiSessionTokenFromRequest: () => null,
    getUiNotificationClients: () => new Set(),
    writeSseEvent: vi.fn(),
    getSessionActivitySnapshot: () => ({ sessions: [] }),
    getSessionStateSnapshot: () => ({}),
    getSessionAttentionSnapshot: () => ({}),
    getSessionState: () => null,
    getSessionAttentionState: () => null,
    markSessionViewed: vi.fn(),
    markSessionUnviewed: vi.fn(),
    markUserMessageSent: vi.fn(),
    setAutoAcceptSession: vi.fn(),
  })
  return app
}

const buildApp = ({ authorized }) => registerWith(express(), { authorized })

describe("session state routes and the UI session", () => {
  const gated = [
    ["get", "/api/session-activity"],
    ["get", "/api/sessions/snapshot"],
    ["get", "/api/sessions/status"],
    ["get", "/api/sessions/ses_a/status"],
    ["get", "/api/sessions/attention"],
    ["get", "/api/sessions/ses_a/attention"],
    ["post", "/api/sessions/ses_a/view"],
    ["post", "/api/sessions/ses_a/unview"],
    ["post", "/api/sessions/ses_a/message-sent"],
    ["post", "/api/notifications/auto-accept"],
  ]

  it.each(gated)("refuses an unauthenticated %s %s", async (method, path) => {
    const response = await request(buildApp({ authorized: false }))[method](path).agent(false)

    expect(response.status).toBe(401)
  })

  it.each(gated)("serves an authenticated %s %s", async (method, path) => {
    const response = await request(buildApp({ authorized: true }))[method](path).agent(false)

    expect(response.status).not.toBe(401)
  })
})
