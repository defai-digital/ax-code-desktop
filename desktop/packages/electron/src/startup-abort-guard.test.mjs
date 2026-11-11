import { describe, expect, it, vi } from "vitest"
import { createQuitCoordinator } from "./quit-coordinator.js"
import { createStartupAbortGuard } from "./startup-abort-guard.js"

function harness() {
  let quitting = false
  const record = vi.fn()
  const onAbandoned = vi.fn()
  const guard = createStartupAbortGuard({ isQuitting: () => quitting, onAbandoned, record })
  return {
    guard,
    record,
    onAbandoned,
    setQuitting: (value) => {
      quitting = value
    },
  }
}

describe("startup abort guard", () => {
  it("lets startup continue while no quit is in progress", () => {
    const { guard, onAbandoned } = harness()
    expect(guard.shouldStop()).toBe(false)
    expect(guard.abandoned).toBe(false)
    expect(guard.quitCancelled("browser-refused")).toBe(false)
    expect(onAbandoned).not.toHaveBeenCalled()
  })

  it("exits when a quit that aborted startup is cancelled, recording where startup stopped", () => {
    const { guard, record, onAbandoned, setQuitting } = harness()
    guard.advance("remote-settings")
    setQuitting(true)
    expect(guard.shouldStop()).toBe(true)
    expect(record).toHaveBeenCalledWith("startup.aborted", { stage: "remote-settings" })

    setQuitting(false)
    expect(guard.quitCancelled("browser-refused")).toBe(true)
    expect(onAbandoned).toHaveBeenCalledWith({ stage: "remote-settings", reason: "browser-refused" })
    expect(record).toHaveBeenCalledWith("startup.abandoned-exit", {
      stage: "remote-settings",
      reason: "browser-refused",
    })
  })

  it("does not exit when the quit is cancelled before startup reached a guard", () => {
    const { guard, onAbandoned, setQuitting } = harness()
    setQuitting(true)
    setQuitting(false)
    expect(guard.quitCancelled("browser-refused")).toBe(false)
    expect(guard.shouldStop()).toBe(false)
    expect(onAbandoned).not.toHaveBeenCalled()
  })

  it("starts the exit once however often the cancellation is reported", () => {
    const { guard, onAbandoned, setQuitting } = harness()
    setQuitting(true)
    guard.shouldStop()
    guard.shouldStop()
    setQuitting(false)
    guard.quitCancelled("a")
    guard.quitCancelled("b")
    expect(onAbandoned).toHaveBeenCalledTimes(1)
  })

  it("leaves a completed startup alone: a later cancelled quit keeps the app running", () => {
    const { guard, onAbandoned, setQuitting } = harness()
    guard.complete()
    setQuitting(true)
    expect(guard.shouldStop()).toBe(false)
    setQuitting(false)
    expect(guard.quitCancelled("browser-refused")).toBe(false)
    expect(onAbandoned).not.toHaveBeenCalled()
  })

  it("reports the stage as complete once startup finished", () => {
    const { guard } = harness()
    guard.advance("window")
    expect(guard.stage).toBe("window")
    guard.complete()
    expect(guard.stage).toBe("complete")
  })

  it("logs a slow startup with its stage but takes no action", () => {
    const timers = []
    const record = vi.fn()
    const onAbandoned = vi.fn()
    const guard = createStartupAbortGuard({
      isQuitting: () => false,
      onAbandoned,
      record,
      slowStartupMs: 1000,
      setTimer: (fn) => {
        timers.push(fn)
        return timers.length
      },
      clearTimer: () => {},
    })
    guard.begin()
    guard.advance("runtime-integrity")
    timers[0]()
    expect(record).toHaveBeenCalledWith("startup.slow", { stage: "runtime-integrity", elapsedMs: 1000 })
    expect(onAbandoned).not.toHaveBeenCalled()
  })

  it("does not log a slow startup once startup completed", () => {
    const record = vi.fn()
    let pending = null
    const clearTimer = vi.fn(() => {
      pending = null
    })
    const guard = createStartupAbortGuard({
      isQuitting: () => false,
      onAbandoned: () => {},
      record,
      setTimer: (fn) => {
        pending = fn
        return 1
      },
      clearTimer,
    })
    guard.begin()
    guard.complete()
    expect(clearTimer).toHaveBeenCalledWith(1)
    expect(pending).toBeNull()
    expect(record).not.toHaveBeenCalled()
  })

  it("with the quit coordinator: a browser refusal during startup ends in exit, not an idle process", async () => {
    let quitting = false
    const onAbandoned = vi.fn()
    const guard = createStartupAbortGuard({ isQuitting: () => quitting, onAbandoned })
    const refused = Object.assign(new Error("refused"), { code: "BROWSER_CLOSURE_REFUSED" })
    const quit = vi.fn()
    const coordinator = createQuitCoordinator({
      onStarting: () => {
        quitting = true
      },
      onCancelled: () => {
        quitting = false
        guard.quitCancelled("browser-closure-refused")
      },
      playEnding: () => {},
      // The startup coroutine reaches its next guard while cleanup is still running.
      stopServices: async () => {
        expect(guard.shouldStop()).toBe(true)
        throw refused
      },
      quit,
      logger: { warn: () => {} },
    })

    await coordinator.handle({ preventDefault: () => {} })

    expect(quit).not.toHaveBeenCalled()
    expect(quitting).toBe(false)
    expect(onAbandoned).toHaveBeenCalledWith({ stage: "starting", reason: "browser-closure-refused" })
  })
})
