import express from "express"
import { describe, expect, it, vi } from "vitest"
import request from "supertest"

import { createFinalErrorHandler } from "../final-error-handler.js"
import { createGracefulShutdownRuntime } from "./shutdown-runtime.js"
import { createStartupPipelineRuntime } from "./startup-pipeline-runtime.js"

// The pipeline mounts the last routes itself, so the terminal error handler has to
// be registered here rather than while the app is first assembled: an error handler
// only sees errors raised by the middleware above it.
const createHarness = () => {
  const app = express()
  const pipeline = createStartupPipelineRuntime({
    createTerminalRuntime: () => ({}),
    createMessageStreamWsRuntime: () => ({}),
    createServerStartupRuntime: () => ({
      resolveBindHost: () => "127.0.0.1",
      startListening: async () => ({ activePort: 51234 }),
      attachProcessHandlers: () => {},
    }),
    createFinalErrorHandler: () => createFinalErrorHandler({ logger: { error: () => {} } }),
  })
  const staticRoutesRuntime = {
    registerStaticRoutes: (expressApp) => {
      expressApp.get("/boom", () => {
        throw new Error("EACCES: permission denied, open '/Users/secret/settings.json'")
      })
      expressApp.get("/ok", (req, res) => {
        res.json({ ok: true })
      })
    },
  }

  return { app, pipeline, staticRoutesRuntime }
}

const runPipeline = async ({ app, pipeline, staticRoutesRuntime, server, extraOptions }) => {
  await pipeline.run({
    app,
    server: server ?? { on: () => {} },
    express,
    setupProxy: (expressApp) => expressApp.use((req, res, next) => next()),
    scheduleAxCodeApiDetection: () => {},
    bootstrapAxCodeAtStartup: () => {},
    staticRoutesRuntime,
    process: {},
    gracefulShutdown: async () => {},
    getSignalsAttached: () => true,
    setSignalsAttached: () => {},
    syncToHmrState: () => {},
    host: "127.0.0.1",
    port: 0,
    attachSignals: false,
    ...extraOptions,
  })
}

describe("startup pipeline error handling", () => {
  it("covers routes mounted by the pipeline with the terminal error handler", async () => {
    const harness = createHarness()
    await runPipeline(harness)

    const failure = await request(harness.app).get("/boom").agent(false)

    expect(failure.status).toBe(500)
    expect(failure.body).toEqual({ error: "Internal server error" })
    expect(failure.text).not.toContain("/Users/secret")
  })

  it("leaves the routes it mounts working", async () => {
    const harness = createHarness()
    await runPipeline(harness)

    const response = await request(harness.app).get("/ok").agent(false)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true })
  })

  it("registers a catch-all that closes upgrades no feature runtime claimed", async () => {
    const harness = createHarness()
    const listeners = {}
    const server = {
      on: (event, handler) => {
        listeners[event] = handler
      },
    }
    const rejectUnclaimedWebSocketUpgrade = vi.fn()

    await runPipeline({ ...harness, server, extraOptions: { rejectUnclaimedWebSocketUpgrade } })

    expect(typeof listeners.upgrade).toBe("function")
    const socket = { destroyed: false }
    listeners.upgrade({ url: "/api/no-such-ws" }, socket)
    expect(rejectUnclaimedWebSocketUpgrade).toHaveBeenCalledWith(socket)
  })
})

describe("startup pipeline failure handling", () => {
  it("stops the managed runtime when the bind fails after the bootstrap fired", async () => {
    // `bootstrapAxCodeAtStartup()` runs before the host is validated and the port bound, and a failure there
    // only logged and exited: every failed launch left the spawned runtime (or its spawn) alive with its port
    // bound.
    const app = express()
    const stopAxCodeLifecycle = vi.fn(async () => {})
    const bootstrapAxCodeAtStartup = vi.fn()
    const pipeline = createStartupPipelineRuntime({
      createTerminalRuntime: () => ({}),
      createMessageStreamWsRuntime: () => ({}),
      createServerStartupRuntime: () => ({
        resolveBindHost: () => "127.0.0.1",
        startListening: async () => {
          throw new Error("EADDRINUSE")
        },
        attachProcessHandlers: () => {},
      }),
      createFinalErrorHandler: () => createFinalErrorHandler({ logger: { error: () => {} } }),
    })

    const run = runPipeline({
      app,
      pipeline,
      staticRoutesRuntime: { registerStaticRoutes: () => {} },
      extraOptions: { bootstrapAxCodeAtStartup, stopAxCodeLifecycle },
    })

    await expect(run).rejects.toThrow("EADDRINUSE")
    expect(bootstrapAxCodeAtStartup).toHaveBeenCalledTimes(1)
    expect(stopAxCodeLifecycle).toHaveBeenCalledTimes(1)
  })

  it("closes a runtime the bootstrap had already started when the bind fails", async () => {
    // The hook above only flags the shutdown and cancels a spawn that has begun; the process itself is closed by
    // the shutdown runtime's phase-3 teardown. Without that second call, a bind failure after the bootstrap had
    // published its handle left the runtime alive with its port bound — the case the flag alone cannot cover.
    const app = express()
    const axCodeProcess = { close: vi.fn(async () => undefined) }
    const setAxCodeProcess = vi.fn()
    const killProcessOnPort = vi.fn()
    const syncToHmrState = vi.fn()
    const shutdownRuntime = createGracefulShutdownRuntime({
      process: { exit: vi.fn() },
      shutdownTimeoutMs: 1000,
      getExitOnShutdown: () => false,
      getIsShuttingDown: () => false,
      setIsShuttingDown: vi.fn(),
      syncToHmrState: vi.fn(),
      axCodeWatcherRuntime: { stop: vi.fn() },
      sessionRuntime: { dispose: vi.fn() },
      getHealthCheckInterval: () => null,
      clearHealthCheckInterval: vi.fn(),
      getTerminalRuntime: () => null,
      setTerminalRuntime: vi.fn(),
      getMessageStreamRuntime: () => null,
      setMessageStreamRuntime: vi.fn(),
      shouldSkipAxCodeStop: () => false,
      getAxCodePort: () => 45678,
      getAxCodeProcess: () => axCodeProcess,
      setAxCodeProcess,
      killProcessOnPort,
      waitForPortRelease: vi.fn(async () => true),
      getServer: () => null,
      getUiAuthController: () => null,
      setUiAuthController: vi.fn(),
      destroyAllClientConnections: vi.fn(),
    })
    const pipeline = createStartupPipelineRuntime({
      createTerminalRuntime: () => ({}),
      createMessageStreamWsRuntime: () => ({}),
      createServerStartupRuntime: () => ({
        resolveBindHost: () => "127.0.0.1",
        startListening: async () => {
          throw new Error("EADDRINUSE")
        },
        attachProcessHandlers: () => {},
      }),
      createFinalErrorHandler: () => createFinalErrorHandler({ logger: { error: () => {} } }),
    })

    const run = runPipeline({
      app,
      pipeline,
      staticRoutesRuntime: { registerStaticRoutes: () => {} },
      extraOptions: {
        bootstrapAxCodeAtStartup: () => {},
        stopAxCodeLifecycle: async () => {},
        stopManagedAxCodeProcess: () => shutdownRuntime.stopManagedAxCodeProcess(),
        syncToHmrState,
      },
    })

    await expect(run).rejects.toThrow("EADDRINUSE")
    expect(axCodeProcess.close).toHaveBeenCalledTimes(1)
    expect(setAxCodeProcess).toHaveBeenCalledWith(null)
    expect(killProcessOnPort).toHaveBeenCalledWith(45678)
    // The closed handle must not survive in the HMR state: a re-entry restores it from there.
    expect(syncToHmrState).toHaveBeenCalledTimes(1)
  })
})
