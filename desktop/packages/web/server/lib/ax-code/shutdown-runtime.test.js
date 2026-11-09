import { afterEach, describe, expect, it, vi } from "vitest"

import { createGracefulShutdownRuntime } from "./shutdown-runtime.js"

const createRuntime = (server, overrides = {}) =>
  createGracefulShutdownRuntime({
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
    shouldSkipAxCodeStop: () => true,
    getAxCodePort: () => null,
    getAxCodeProcess: () => null,
    setAxCodeProcess: vi.fn(),
    killProcessOnPort: vi.fn(),
    waitForPortRelease: vi.fn(async () => true),
    getServer: () => server,
    getUiAuthController: () => null,
    setUiAuthController: vi.fn(),
    getActiveTunnelController: () => null,
    setActiveTunnelController: vi.fn(),
    destroyAllClientConnections: vi.fn(),
    ...overrides,
  })

describe("graceful shutdown runtime", () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("clears the server close timeout when the server closes first", async () => {
    vi.useFakeTimers()
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const server = {
      close: vi.fn((callback) => {
        callback()
      }),
    }

    const runtime = createRuntime(server)
    await runtime.gracefulShutdown({ exitProcess: false })

    await vi.advanceTimersByTimeAsync(1000)

    expect(warnSpy).not.toHaveBeenCalledWith("Server close timeout reached, forcing shutdown")
    expect(vi.getTimerCount()).toBe(0)
  })

  it("closes the managed process and frees its port in the teardown the pipeline shares", async () => {
    // The extraction that let the startup pipeline reuse this teardown must keep closing the process the
    // lifecycle published — the flag/abort hook the pipeline used to call does not.
    const axCodeProcess = { close: vi.fn(async () => undefined) }
    const setAxCodeProcess = vi.fn()
    const killProcessOnPort = vi.fn()
    const runtime = createRuntime(null, {
      shouldSkipAxCodeStop: () => false,
      getAxCodePort: () => 45678,
      getAxCodeProcess: () => axCodeProcess,
      setAxCodeProcess,
      killProcessOnPort,
    })

    await runtime.gracefulShutdown({ exitProcess: false })

    expect(axCodeProcess.close).toHaveBeenCalledTimes(1)
    expect(setAxCodeProcess).toHaveBeenCalledWith(null)
    expect(killProcessOnPort).toHaveBeenCalledWith(45678)
  })

  it("still exits when a teardown step throws", async () => {
    // The throw skipped process.exit, and the shutdown flag then made every later signal a no-op.
    vi.spyOn(console, "error").mockImplementation(() => {})
    const exit = vi.fn()
    const runtime = createRuntime(null, {
      process: { exit },
      axCodeWatcherRuntime: {
        stop: () => {
          throw new Error("watcher already closed")
        },
      },
    })

    await runtime.gracefulShutdown({ exitProcess: true })

    expect(exit).toHaveBeenCalledWith(1)
  })

  it("exits at once on a repeated signal while a teardown step hangs", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const exit = vi.fn()
    let shuttingDown = false
    const runtime = createRuntime(null, {
      process: { exit },
      getIsShuttingDown: () => shuttingDown,
      setIsShuttingDown: (value) => {
        shuttingDown = value
      },
      getTerminalRuntime: () => ({ shutdown: () => new Promise(() => {}) }),
    })

    void runtime.gracefulShutdown({ exitProcess: true, repeatExits: true })
    await Promise.resolve()
    expect(exit).not.toHaveBeenCalled()

    await runtime.gracefulShutdown({ exitProcess: true, repeatExits: true })
    expect(exit).toHaveBeenCalledWith(1)
  })
})
