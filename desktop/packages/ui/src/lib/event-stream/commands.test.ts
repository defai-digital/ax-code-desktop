import { afterEach, describe, expect, it, vi } from "vitest"
import { requestSyncRetryNow, SYNC_RETRY_NOW_EVENT } from "./commands"

afterEach(() => vi.unstubAllGlobals())

describe("event stream retry command", () => {
  it("dispatches the transport retry event on the current window", () => {
    const listener = vi.fn()
    window.addEventListener(SYNC_RETRY_NOW_EVENT, listener)
    try {
      requestSyncRetryNow()
      expect(listener).toHaveBeenCalledOnce()
      expect(listener.mock.calls[0][0].type).toBe("openchamber:sync-retry-now")
    } finally {
      window.removeEventListener(SYNC_RETRY_NOW_EVENT, listener)
    }
  })

  it("is safe before a browser window is available", () => {
    vi.stubGlobal("window", undefined)
    expect(() => requestSyncRetryNow()).not.toThrow()
  })

  it("is safe when DOM dispatch is unavailable", () => {
    vi.stubGlobal("window", {})
    expect(() => requestSyncRetryNow()).not.toThrow()
  })
})
