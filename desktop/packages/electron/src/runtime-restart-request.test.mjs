import { createRequire } from "node:module"
import { describe, expect, test } from "vitest"

const require = createRequire(import.meta.url)
const { createRuntimeRestartRequestHandler } = require("./runtime-restart-request.js")

const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve))

function createLogger() {
  const logs = []
  const errors = []
  return {
    logs,
    errors,
    logger: {
      log: (...args) => logs.push(args.join(" ")),
      error: (...args) => errors.push(args.join(" ")),
    },
  }
}

describe("runtime restart request handler", () => {
  test("a runtime-restart-request message restarts the supervision with reprepare", async () => {
    const restarts = []
    const { logger, logs } = createLogger()
    const handler = createRuntimeRestartRequestHandler({
      getSupervision: () => ({
        restart: (opts) => {
          restarts.push(opts)
          return Promise.resolve()
        },
      }),
      logger,
    })

    expect(handler.handleMessage({ type: "runtime-restart-request" })).toBe(true)
    expect(restarts).toEqual([{ reprepare: true }])
    await flushMicrotasks()
    expect(logs.some((line) => line.includes("restarted"))).toBe(true)
  })

  test("unrelated messages are not consumed", () => {
    const handler = createRuntimeRestartRequestHandler({ getSupervision: () => null, logger: createLogger().logger })
    expect(handler.handleMessage({ type: "runtime-origin", origin: null })).toBe(false)
    expect(handler.handleMessage(null)).toBe(false)
  })

  test("requests while one is in flight coalesce into one follow-up restart", async () => {
    let release
    const restarts = []
    const handler = createRuntimeRestartRequestHandler({
      getSupervision: () => ({
        restart: (opts) => {
          restarts.push(opts)
          return new Promise((resolve) => {
            release = resolve
          })
        },
      }),
      logger: createLogger().logger,
    })

    handler.handleMessage({ type: "runtime-restart-request" })
    await flushMicrotasks()
    expect(handler.inFlight).toBe(true)
    handler.handleMessage({ type: "runtime-restart-request" })
    handler.handleMessage({ type: "runtime-restart-request" })
    expect(restarts).toHaveLength(1)

    const releaseFirst = release
    releaseFirst()
    await flushMicrotasks()
    // The in-flight restart resolved its binary before the later requests
    // landed, so exactly one follow-up restart runs to pick up the newest
    // settings — no matter how many requests queued up behind it.
    expect(restarts).toHaveLength(2)
    expect(handler.inFlight).toBe(true)

    const releaseSecond = release
    releaseSecond()
    await flushMicrotasks()
    expect(restarts).toHaveLength(2)
    expect(handler.inFlight).toBe(false)
  })

  test("a missing supervision (escape-hatch mode) consumes the message without restarting", () => {
    const handler = createRuntimeRestartRequestHandler({ getSupervision: () => null, logger: createLogger().logger })
    expect(handler.handleMessage({ type: "runtime-restart-request" })).toBe(true)
    expect(handler.inFlight).toBe(false)
  })

  test("a rejecting restart is logged and releases the in-flight gate", async () => {
    const { logger, errors } = createLogger()
    const handler = createRuntimeRestartRequestHandler({
      getSupervision: () => ({ restart: () => Promise.reject(new Error("boom")) }),
      logger,
    })

    handler.handleMessage({ type: "runtime-restart-request" })
    await flushMicrotasks()
    await flushMicrotasks()
    expect(errors.some((line) => line.includes("boom"))).toBe(true)
    expect(handler.inFlight).toBe(false)
  })

  test("requires a getSupervision function", () => {
    expect(() => createRuntimeRestartRequestHandler({})).toThrow(TypeError)
  })
})
