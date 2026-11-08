import { afterEach, describe, expect, test, vi } from "vitest"
import { scheduleIdleTask } from "./idleTask"

// Optional so a test can remove requestIdleCallback to exercise the timer fallback.
type IdleWindow = {
  requestIdleCallback?: Window["requestIdleCallback"]
  cancelIdleCallback?: Window["cancelIdleCallback"]
}

const idleWindow = window as unknown as IdleWindow
const originalRequest = idleWindow.requestIdleCallback
const originalCancel = idleWindow.cancelIdleCallback

afterEach(() => {
  idleWindow.requestIdleCallback = originalRequest
  idleWindow.cancelIdleCallback = originalCancel
  vi.useRealTimers()
})

describe("scheduleIdleTask", () => {
  test("runs the task from an idle callback bounded by a timeout", () => {
    let idle: (() => void) | undefined
    const request = vi.fn((callback: IdleRequestCallback, options?: IdleRequestOptions) => {
      idle = () => callback({ didTimeout: false, timeRemaining: () => 10 })
      expect(options?.timeout).toBeGreaterThan(0)
      return 7
    })
    idleWindow.requestIdleCallback = request as unknown as Window["requestIdleCallback"]
    idleWindow.cancelIdleCallback = vi.fn()
    const task = vi.fn()

    scheduleIdleTask(task)
    expect(task).not.toHaveBeenCalled()
    idle?.()
    expect(task).toHaveBeenCalledTimes(1)
  })

  test("cancelling before idle cancels the pending callback", () => {
    idleWindow.requestIdleCallback = vi.fn(() => 7) as unknown as Window["requestIdleCallback"]
    const cancel = vi.fn()
    idleWindow.cancelIdleCallback = cancel

    scheduleIdleTask(vi.fn())()
    expect(cancel).toHaveBeenCalledWith(7)
  })

  test("falls back to a timer without requestIdleCallback, and that timer can be cancelled", () => {
    vi.useFakeTimers()
    idleWindow.requestIdleCallback = undefined
    const task = vi.fn()

    scheduleIdleTask(task)
    vi.advanceTimersByTime(1_000)
    expect(task).toHaveBeenCalledTimes(1)

    const cancelled = vi.fn()
    scheduleIdleTask(cancelled)()
    vi.advanceTimersByTime(5_000)
    expect(cancelled).not.toHaveBeenCalled()
  })
})
