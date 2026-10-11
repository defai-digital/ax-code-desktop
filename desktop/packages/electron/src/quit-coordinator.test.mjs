import { describe, expect, it, vi } from "vitest"
import { createQuitCoordinator } from "./quit-coordinator.js"

describe("quit coordination", () => {
  it("starts ending and runtime cleanup concurrently and holds repeated quit requests", async () => {
    let finishEnding, finishCleanup
    const playEnding = vi.fn(
      () =>
        new Promise((resolve) => {
          finishEnding = resolve
        }),
    )
    const stopServices = vi.fn(
      () =>
        new Promise((resolve) => {
          finishCleanup = resolve
        }),
    )
    const quit = vi.fn(),
      onStarting = vi.fn()
    const coordinator = createQuitCoordinator({ playEnding, stopServices, quit, onStarting })
    const event = { preventDefault: vi.fn() }
    const pending = coordinator.handle(event)
    expect(coordinator.handle(event)).toBe(pending)
    await Promise.resolve()
    expect(playEnding).toHaveBeenCalledTimes(1)
    expect(stopServices).toHaveBeenCalledTimes(1)
    expect(onStarting).toHaveBeenCalledTimes(1)
    finishEnding()
    await Promise.resolve()
    expect(quit).not.toHaveBeenCalled()
    finishCleanup()
    await pending
    expect(quit).toHaveBeenCalledTimes(1)
    const finalEvent = { preventDefault: vi.fn() }
    coordinator.handle(finalEvent)
    expect(finalEvent.preventDefault).not.toHaveBeenCalled()
  })

  it("still quits after an ending or cleanup failure", async () => {
    const quit = vi.fn(),
      logger = { warn: vi.fn() }
    const coordinator = createQuitCoordinator({
      onStarting: () => {},
      playEnding: () => {
        throw new Error("media failed")
      },
      stopServices: () => Promise.reject(new Error("cleanup failed")),
      quit,
      logger,
    })
    await coordinator.handle({ preventDefault: vi.fn() })
    expect(quit).toHaveBeenCalledTimes(1)
    expect(logger.warn).toHaveBeenCalledTimes(2)
  })
})
