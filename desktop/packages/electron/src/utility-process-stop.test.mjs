import { createRequire } from "node:module"
import { EventEmitter } from "node:events"
import { afterEach, describe, expect, test, vi } from "vitest"

const { gracefulStopServerProcess, forceStopUtilityProcess } = createRequire(import.meta.url)("./utility-process-stop")

function fixture() {
  const child = new EventEmitter()
  child.pid = 12345
  child.postMessage = vi.fn()
  // Electron 46 ignores arguments to kill() and only delivers SIGTERM on POSIX.
  child.kill = vi.fn(() => true)
  const killProcess = vi.fn(() => {
    child.pid = undefined
    child.emit("exit", 0)
  })
  return { child, killProcess }
}

afterEach(() => vi.useRealTimers())

describe("utility process stop", () => {
  test("forces a SIGTERM-resistant utility process to exit after the shutdown deadlines", async () => {
    vi.useFakeTimers()
    const { child, killProcess } = fixture()
    const stopping = gracefulStopServerProcess(child, { termTimeoutMs: 20, killTimeoutMs: 30 }, { killProcess })
    expect(child.postMessage).toHaveBeenCalledWith({ type: "stop" })
    await vi.advanceTimersByTimeAsync(20)
    expect(killProcess).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(30)
    await stopping
    expect(killProcess).toHaveBeenCalledWith(12345, "SIGKILL")
    expect(child.pid).toBeUndefined()
    expect(child.listenerCount("exit")).toBe(0)
  })

  test("boot-failure termination force-stops the current utility PID", () => {
    const { child, killProcess } = fixture()
    forceStopUtilityProcess(child, { killProcess })
    expect(killProcess).toHaveBeenCalledWith(12345, "SIGKILL")
    expect(child.pid).toBeUndefined()
  })

  test("still escalates when the stop message cannot be delivered", async () => {
    vi.useFakeTimers()
    const { child, killProcess } = fixture()
    child.postMessage.mockImplementation(() => { throw new Error("IPC closed") })
    const stopping = gracefulStopServerProcess(child, { termTimeoutMs: 20, killTimeoutMs: 30 }, { killProcess })
    await vi.advanceTimersByTimeAsync(30)
    await stopping
    expect(killProcess).toHaveBeenCalledWith(12345, "SIGKILL")
  })

  test("does not force-kill a process that exits while receiving SIGTERM", async () => {
    vi.useFakeTimers()
    const { child, killProcess } = fixture()
    child.kill.mockImplementation(() => { child.emit("exit", 0); return true })
    const stopping = gracefulStopServerProcess(child, { termTimeoutMs: 20, killTimeoutMs: 30 }, { killProcess })
    await vi.advanceTimersByTimeAsync(20)
    await stopping
    expect(vi.getTimerCount()).toBe(0)
    expect(killProcess).not.toHaveBeenCalled()
    expect(child.listenerCount("exit")).toBe(0)
  })

  test("a successful IPC stop clears both escalation timers and its exit listener", async () => {
    vi.useFakeTimers()
    const { child, killProcess } = fixture()
    const stopping = gracefulStopServerProcess(child, { termTimeoutMs: 20, killTimeoutMs: 30 }, { killProcess })
    child.emit("exit", 0)
    await stopping
    expect(vi.getTimerCount()).toBe(0)
    expect(child.listenerCount("exit")).toBe(0)
    expect(child.kill).not.toHaveBeenCalled()
    expect(killProcess).not.toHaveBeenCalled()
  })

  test("uses the current PID rather than signaling an exited process or a process group", async () => {
    vi.useFakeTimers()
    const { child, killProcess } = fixture()
    const stopping = gracefulStopServerProcess(child, { termTimeoutMs: 20, killTimeoutMs: 30 }, { killProcess })
    child.pid = undefined
    await vi.advanceTimersByTimeAsync(50)
    await stopping
    expect(killProcess).not.toHaveBeenCalled()
    expect(child.listenerCount("exit")).toBe(0)
  })

  test("does not expose raw native errors when force termination fails", () => {
    const { child } = fixture()
    const logger = { warn: vi.fn() }
    const killProcess = vi.fn(() => { throw new Error("PRIVATE_NATIVE_PAYLOAD") })
    expect(forceStopUtilityProcess(child, { killProcess, logger })).toBe(false)
    expect(logger.warn).toHaveBeenCalledWith("[electron] failed to force-stop the server utility process")
  })
})
