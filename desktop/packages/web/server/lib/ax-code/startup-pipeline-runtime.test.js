import express from "express"
import { describe, expect, it, vi } from "vitest"
import request from "supertest"

import { createFinalErrorHandler } from "../final-error-handler.js"
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
