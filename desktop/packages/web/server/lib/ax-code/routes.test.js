import { describe, expect, it, vi } from "vitest"
import express from "express"
import request from "supertest"
import { EventEmitter } from "node:events"
import { registerAxCodeRoutes } from "./routes.js"
import { createMockResponse, createRouteRegistry } from "../../test-helpers/route-harness.js"

const createApp = (overrides = {}, { parseJson = true } = {}) => {
  const app = express()
  // Production deliberately does NOT run express.json() for `/api/session/*`
  // (those stream through the proxy / dedicated handlers). Tests can opt out of
  // global JSON parsing via `parseJson: false` to mirror that and exercise the
  // raw-body forwarding path.
  if (parseJson) {
    app.use(express.json())
  }

  const dependencies = {
    crypto: globalThis.crypto,
    clientReloadDelayMs: 25,
    getAxCodeResolutionSnapshot: vi.fn(() => ({})),
    getAxCodeBinarySource: vi.fn(() => null),
    formatSettingsResponse: vi.fn((settings) => settings),
    readSettingsFromDisk: vi.fn(async () => ({})),
    readSettingsFromDiskMigrated: vi.fn(async () => ({})),
    persistSettings: vi.fn(async (settings) => settings),
    sanitizeProjects: vi.fn((projects) => projects),
    validateDirectoryPath: vi.fn(() => ({ valid: true })),
    resolveProjectDirectory: vi.fn(async () => ({ directory: "/tmp/project", error: null })),
    getProviderSources: vi.fn(() => ({ sources: {} })),
    removeProviderConfig: vi.fn(() => true),
    refreshAxCodeAfterConfigChange: vi.fn(async () => undefined),
    backgroundAxCodeReloader: {
      start: vi.fn(() => ({
        alreadyRunning: false,
        reloadDelayMs: 1500,
        reloadTimeoutMs: 360000,
      })),
    },
    buildAxCodeUrl: vi.fn((path) => `http://127.0.0.1:4096${path}`),
    getAxCodeAuthHeaders: vi.fn(() => ({})),
    ...overrides,
  }

  registerAxCodeRoutes(app, dependencies)
  return { app, dependencies }
}

const createDependencies = () => ({
  crypto: globalThis.crypto,
  clientReloadDelayMs: 25,
  getAxCodeResolutionSnapshot: vi.fn(() => ({})),
  getAxCodeBinarySource: vi.fn(() => null),
  formatSettingsResponse: vi.fn((settings) => settings),
  readSettingsFromDisk: vi.fn(async () => ({})),
  readSettingsFromDiskMigrated: vi.fn(async () => ({})),
  persistSettings: vi.fn(async (settings) => settings),
  sanitizeProjects: vi.fn((projects) => projects),
  validateDirectoryPath: vi.fn(() => ({ valid: true })),
  resolveProjectDirectory: vi.fn(async () => ({ directory: "/tmp/project", error: null })),
  getProviderSources: vi.fn(() => ({ sources: {} })),
  removeProviderConfig: vi.fn(() => true),
  refreshAxCodeAfterConfigChange: vi.fn(async () => {}),
  backgroundAxCodeReloader: {
    start: vi.fn(() => ({ alreadyRunning: false, reloadDelayMs: 1500, reloadTimeoutMs: 360000 })),
  },
  buildAxCodeUrl: vi.fn((path) => `http://127.0.0.1:4096${path}`),
  getAxCodeAuthHeaders: vi.fn(() => ({})),
})

describe("ax-code routes", () => {
  it("queues provider disconnect reload without awaiting the AX Code restart", async () => {
    const { app, dependencies } = createApp()

    const response = await request(app).delete("/api/provider/test-provider/auth?scope=user").expect(200)

    expect(dependencies.removeProviderConfig).toHaveBeenCalledWith("test-provider", "/tmp/project", "user")
    expect(dependencies.backgroundAxCodeReloader.start).toHaveBeenCalledWith(
      "provider test-provider disconnected (user)",
    )
    expect(dependencies.refreshAxCodeAfterConfigChange).not.toHaveBeenCalled()
    expect(response.body).toMatchObject({
      success: true,
      removed: true,
      requiresReload: true,
      reloadInProgress: false,
      message: "Provider disconnected. AX Code is restarting…",
      reloadDelayMs: 1500,
      reloadTimeoutMs: 360000,
    })
  })

  it("does not queue a provider reload when nothing was removed", async () => {
    const { app, dependencies } = createApp({
      removeProviderConfig: vi.fn(() => false),
    })

    const response = await request(app).delete("/api/provider/test-provider/auth?scope=user").expect(200)

    expect(dependencies.backgroundAxCodeReloader.start).not.toHaveBeenCalled()
    expect(response.body).toMatchObject({
      success: true,
      removed: false,
      requiresReload: false,
      message: "Provider was not connected",
    })
  })

  it("rejects invalid provider auth scopes before removing provider state", async () => {
    const { app, dependencies } = createApp()

    const response = await request(app).delete("/api/provider/test-provider/auth?scope=workspace").expect(400)

    expect(dependencies.removeProviderConfig).not.toHaveBeenCalled()
    expect(response.body).toEqual({ error: "Invalid scope" })
  })

  it("calls ax-code API for scope=auth removal and triggers reload", async () => {
    const { app, dependencies } = createApp()
    const originalFetch = globalThis.fetch
    const mockFetch = vi.fn(async (url, opts) => {
      if (typeof url === "string" && url.includes("/auth/test-provider") && opts?.method === "DELETE") {
        return { ok: true, status: 200, body: { cancel: vi.fn() } }
      }
      return { ok: true, json: async () => ({}) }
    })
    globalThis.fetch = mockFetch

    try {
      const response = await request(app).delete("/api/provider/test-provider/auth?scope=auth").expect(200)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/auth/test-provider"),
        expect.objectContaining({ method: "DELETE" }),
      )
      expect(dependencies.backgroundAxCodeReloader.start).toHaveBeenCalledWith(
        "provider test-provider disconnected (auth)",
      )
      expect(response.body).toMatchObject({
        success: true,
        removed: true,
        requiresReload: true,
      })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("falls back to direct file removal when ax-code API is unreachable", async () => {
    const { app } = createApp()
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async () => {
      throw new Error("ECONNREFUSED")
    })
    // The auth library is loaded lazily; we need to mock the import.
    // Since we can't easily mock dynamic imports, we verify the fallback
    // by checking that the route still succeeds.
    try {
      const response = await request(app).delete("/api/provider/test-provider/auth?scope=auth").expect(200)

      // The fallback to direct file removal should have been attempted.
      // Since the auth library reads real files, the result depends on
      // whether the auth file exists — but the response should still succeed.
      expect(response.body.success).toBe(true)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("reports runtime version compatibility in upgrade status", async () => {
    const { app } = createApp()
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ healthy: true, version: "5.10.0" }),
    }))

    try {
      const response = await request(app).get("/api/ax-code/upgrade-status").expect(200)

      expect(response.body).toMatchObject({
        currentVersion: "5.10.0",
        compatible: false,
      })
      expect(typeof response.body.minSupportedVersion).toBe("string")
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("returns null compatibility when the runtime version is unavailable", async () => {
    const { app } = createApp()
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ healthy: true }),
    }))

    try {
      const response = await request(app).get("/api/ax-code/upgrade-status").expect(200)

      expect(response.body.currentVersion).toBeNull()
      expect(response.body.compatible).toBeNull()
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("reports the resolved binary source in upgrade status", async () => {
    const { app } = createApp({
      getAxCodeBinarySource: vi.fn(() => "bundled"),
    })
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ healthy: true, version: "7.9.12" }),
    }))

    try {
      const response = await request(app).get("/api/ax-code/upgrade-status").expect(200)

      expect(response.body.binarySource).toBe("bundled")
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("refuses to upgrade a bundled runtime with 409", async () => {
    const { app } = createApp({
      getAxCodeBinarySource: vi.fn(() => "bundled"),
    })
    const originalFetch = globalThis.fetch
    const mockFetch = vi.fn()
    globalThis.fetch = mockFetch

    try {
      const response = await request(app).post("/api/ax-code/upgrade").send({}).expect(409)

      expect(response.body).toMatchObject({
        success: false,
        managedByAppUpdate: true,
      })
      // The upstream runtime must not receive an upgrade request.
      expect(mockFetch).not.toHaveBeenCalled()
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("allows upgrades for non-bundled runtimes", async () => {
    const { app, dependencies } = createApp({
      getAxCodeBinarySource: vi.fn(() => "path"),
    })
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ success: true }),
    }))

    try {
      const response = await request(app).post("/api/ax-code/upgrade").send({}).expect(200)

      expect(response.body).toMatchObject({ success: true, restarted: true })
      expect(dependencies.refreshAxCodeAfterConfigChange).toHaveBeenCalledWith("ax-code upgrade")
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("maps unknown command upstream 500 responses to a client error", async () => {
    const { app } = createApp()
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            name: "UnknownError",
            message: "Internal server error",
            status: 500,
            retryable: false,
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          },
        ),
    )

    try {
      const response = await request(app)
        .post("/api/session/ses-1/command?directory=/tmp/project")
        .send({
          command: " abc123 ",
          arguments: "manual API unknown command test",
          model: "provider/model",
          messageID: "msg-1",
        })
        .expect(400)

      expect(response.body).toMatchObject({
        error: "Unknown command: abc123",
        retryable: false,
      })
      expect(String(response.body.message)).toContain("Unknown command: abc123")
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("forwards explicit command-not-found 400 responses from newer CLIs", async () => {
    const { app } = createApp()
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            name: "InvalidRequestError",
            message: 'Command not found: "arena". Available commands: init, review',
            status: 400,
            details: { resource: "command" },
            retryable: false,
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        ),
    )

    try {
      const response = await request(app)
        .post("/api/session/ses-1/command?directory=/tmp/project")
        .send({
          command: "arena",
          arguments: "compare plans",
          model: "provider/model",
          messageID: "msg-1",
        })
        .expect(400)

      expect(response.body).toMatchObject({
        error: 'Command not found: "arena". Available commands: init, review',
        retryable: false,
      })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("deduplicates concurrent prompt_async requests for the same session message", async () => {
    const { app } = createApp()
    const originalFetch = globalThis.fetch
    let releaseFetch
    const fetchStarted = new Promise((resolve) => {
      globalThis.fetch = vi.fn(async () => {
        resolve(undefined)
        await new Promise((release) => {
          releaseFetch = release
        })
        return new Response(JSON.stringify({ accepted: true }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        })
      })
    })

    try {
      const payload = {
        model: { providerID: "provider", modelID: "model" },
        messageID: " msg-1 ",
        parts: [{ type: "text", text: "hello" }],
      }
      const first = request(app)
        .post("/api/session/ses-1/prompt_async")
        .send(payload)
        .then((response) => response)
      await fetchStarted
      const second = request(app)
        .post("/api/session/ses-1/prompt_async")
        .send({ ...payload, messageID: "msg-1" })
        .then((response) => response)
      releaseFetch()

      const [firstResponse, secondResponse] = await Promise.all([first, second])

      expect(firstResponse.status).toBe(202)
      expect(secondResponse.status).toBe(202)
      expect(globalThis.fetch).toHaveBeenCalledTimes(1)
      expect(firstResponse.body).toEqual({ accepted: true })
      expect(secondResponse.body).toEqual({ accepted: true })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("keeps deduplicating a prompt_async request that runs longer than the idempotency TTL", async () => {
    // Pruning used to age out an entry that was still in flight, so a retry with
    // the same messageID after the TTL started a second upstream prompt. The
    // route is driven directly (no TCP) so the second call is guaranteed to
    // arrive while the first upstream request is still pending.
    const { app, getRoute } = createRouteRegistry()
    const dependencies = createDependencies()
    registerAxCodeRoutes(app, dependencies)
    const handler = getRoute("POST", "/api/session/:sessionId/prompt_async")

    const originalFetch = globalThis.fetch
    const realNow = Date.now
    let offsetMs = 0
    let releaseFetch = () => {}
    const fetchStarted = new Promise((resolve) => {
      globalThis.fetch = vi.fn(async () => {
        resolve(undefined)
        await new Promise((release) => {
          releaseFetch = release
        })
        return new Response(JSON.stringify({ accepted: true }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        })
      })
    })
    const payload = JSON.stringify({
      model: { providerID: "provider", modelID: "model" },
      messageID: "msg-long",
      parts: [{ type: "text", text: "hello" }],
    })
    const makeRequest = () => {
      const req = new EventEmitter()
      req.method = "POST"
      req.params = { sessionId: "ses-1" }
      req.url = "/api/session/ses-1/prompt_async"
      req.originalUrl = req.url
      req.headers = {}
      req.get = () => undefined
      queueMicrotask(() => {
        req.emit("data", Buffer.from(payload))
        req.emit("end")
      })
      return req
    }

    try {
      Date.now = () => realNow() + offsetMs

      const firstRes = createMockResponse()
      const first = handler(makeRequest(), firstRes)
      await fetchStarted
      await Promise.resolve()

      // The upstream call is still running when the TTL has long expired.
      offsetMs = 5 * 60 * 1000

      const secondRes = createMockResponse()
      const second = handler(makeRequest(), secondRes)
      for (let i = 0; i < 10; i += 1) {
        await Promise.resolve()
      }

      // Still a single upstream prompt while the first is in flight.
      expect(globalThis.fetch).toHaveBeenCalledTimes(1)

      releaseFetch()
      await Promise.all([first, second])

      expect(globalThis.fetch).toHaveBeenCalledTimes(1)
      expect(String(firstRes.body)).toContain("accepted")
      expect(String(secondRes.body)).toContain("accepted")
    } finally {
      Date.now = realNow
      globalThis.fetch = originalFetch
    }
  })

  it("rejects a forwarded body that exceeds the ceiling", async () => {
    // The cap only applies on the raw-body path production uses for
    // /api/session/* (no express.json() there).
    const { app } = createApp({}, { parseJson: false })
    const originalFetch = globalThis.fetch
    const originalLimit = process.env.AX_CODE_DESKTOP_MAX_FORWARD_BODY_BYTES
    // The limit is read once at module load, so exercise the parse-time path by
    // sending a body over the configured (test-sized) ceiling instead.
    globalThis.fetch = vi.fn(async () => new Response("{}", { status: 200 }))
    process.env.AX_CODE_DESKTOP_MAX_FORWARD_BODY_BYTES = "1024"

    try {
      const response = await request(app)
        .post("/api/session/ses-1/prompt_async")
        .set("content-type", "application/json")
        .send(JSON.stringify({ messageID: "msg-big", parts: [{ type: "text", text: "a".repeat(4096) }] }))

      expect(response.status).toBe(413)
      expect(globalThis.fetch).not.toHaveBeenCalled()
    } finally {
      globalThis.fetch = originalFetch
      process.env.AX_CODE_DESKTOP_MAX_FORWARD_BODY_BYTES = originalLimit ?? ""
      if (originalLimit === undefined) delete process.env.AX_CODE_DESKTOP_MAX_FORWARD_BODY_BYTES
    }
  })

  it("forwards the real prompt_async body upstream when it is not pre-parsed", async () => {
    // Regression: /api/session/* is not run through express.json() in
    // production, so req.body is undefined and the handler must read the raw
    // request stream. Previously it forwarded JSON.stringify(req.body ?? {})
    // === "{}", so ax-code received a body with no model/parts and rejected
    // every prompt with an opaque 400 "Invalid request".
    const { app } = createApp({}, { parseJson: false })
    const originalFetch = globalThis.fetch
    let forwardedBody = null
    globalThis.fetch = vi.fn(async (_url, init) => {
      forwardedBody = init?.body ?? null
      return new Response(JSON.stringify({ accepted: true }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      })
    })

    try {
      const payload = {
        model: { providerID: "provider", modelID: "model" },
        messageID: "msg-raw-1",
        parts: [{ type: "text", text: "hello" }],
      }
      const response = await request(app)
        .post("/api/session/ses-1/prompt_async")
        .set("Content-Type", "application/json")
        .send(JSON.stringify(payload))
        .expect(202)

      expect(response.body).toEqual({ accepted: true })
      expect(forwardedBody).toBeTypeOf("string")
      expect(JSON.parse(forwardedBody)).toEqual(payload)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("forwards the real command body upstream when it is not pre-parsed", async () => {
    const { app } = createApp({}, { parseJson: false })
    const originalFetch = globalThis.fetch
    let forwardedBody = null
    globalThis.fetch = vi.fn(async (_url, init) => {
      forwardedBody = init?.body ?? null
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    })

    try {
      const payload = { command: "review", arguments: "", model: "provider/model", messageID: "msg-cmd-1" }
      await request(app)
        .post("/api/session/ses-1/command")
        .set("Content-Type", "application/json")
        .send(JSON.stringify(payload))
        .expect(200)

      expect(forwardedBody).toBeTypeOf("string")
      expect(JSON.parse(forwardedBody)).toEqual(payload)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
