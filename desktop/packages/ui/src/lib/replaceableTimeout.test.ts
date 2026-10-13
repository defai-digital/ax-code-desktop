import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { clearReplaceableTimeout, resetReplaceableTimeout } from "./replaceableTimeout"

describe("replaceable timeouts", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("replaces an existing timer so only the latest one runs", () => {
    const reset = vi.fn()
    const first = resetReplaceableTimeout(null, reset, 100)
    resetReplaceableTimeout(first, reset, 200)

    vi.advanceTimersByTime(100)
    expect(reset).not.toHaveBeenCalled()

    vi.advanceTimersByTime(100)
    expect(reset).toHaveBeenCalledTimes(1)
  })

  it("clears a pending timer during cleanup", () => {
    const reset = vi.fn()
    const timer = resetReplaceableTimeout(null, reset, 100)

    expect(clearReplaceableTimeout(timer)).toBeNull()
    vi.advanceTimersByTime(100)

    expect(reset).not.toHaveBeenCalled()
  })
})
