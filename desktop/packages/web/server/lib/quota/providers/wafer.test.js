import fsPromises from "fs/promises"
import os from "os"
import path from "path"
import { describe, expect, it, vi } from "vitest"
import { transformWaferWindows } from "./wafer.js"

describe("Wafer quota transforms", () => {
  it("reports the payload percent and labels the window from its own boundaries", () => {
    const result = transformWaferWindows({
      remaining_included_requests: 25,
      included_request_limit: 100,
      current_period_used_percent: 75,
      window_start: 1_000,
      window_end: 19_000,
      plan_tier: "pro",
    })

    expect(result.windowLabel).toBe("5h")
    expect(result.windows["5h"]).toMatchObject({
      usedPercent: 75,
      remainingPercent: 25,
      windowSeconds: 18_000,
      valueLabel: "pro · 25 / 100 left",
    })
  })

  it("keeps a missing percent unknown instead of reporting a full bar", () => {
    // The API can return the counts without current_period_used_percent; every other provider
    // reports null there, and 0 would draw an empty bar and "100% remaining".
    const result = transformWaferWindows({
      remaining_included_requests: 25,
      included_request_limit: 100,
      current_period_used_percent: null,
    })

    expect(result.windows["5h"].usedPercent).toBeNull()
    expect(result.windows["5h"].remainingPercent).toBeNull()
    expect(result.windows["5h"].valueLabel).toBe("25 / 100 left")
  })

  it("keeps a percent above 100 when the plan is in overage", () => {
    const result = transformWaferWindows({
      remaining_included_requests: 0,
      included_request_limit: 100,
      overage_request_count: 12,
      current_period_used_percent: 112,
    })

    expect(result.windows["5h"]).toMatchObject({
      usedPercent: 112,
      valueLabel: "0 / 100 left · +12 overage",
    })
  })

  it("clamps a percent above 100 when there is no overage", () => {
    const result = transformWaferWindows({
      included_request_limit: 100,
      current_period_used_percent: 130,
    })

    expect(result.windows["5h"].usedPercent).toBe(100)
  })

  it("returns null when the payload carries no quota data", () => {
    expect(transformWaferWindows({})).toBeNull()
    expect(transformWaferWindows({ plan_tier: "pro" })).toBeNull()
    expect(transformWaferWindows(null)).toBeNull()
  })
  it("reports a timeout as a timeout instead of the raw abort message", async () => {
    // `AbortSignal.timeout()` rejects with a DOMException named "TimeoutError", never "AbortError", so the
    // friendly branch could not fire and the card showed "The operation was aborted due to timeout".
    const dataDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "wafer-quota-"))
    const previousDataHome = process.env.XDG_DATA_HOME
    const previousDataDir = process.env.AX_CODE_DATA_DIR
    process.env.XDG_DATA_HOME = dataDir
    delete process.env.AX_CODE_DATA_DIR
    await fsPromises.mkdir(path.join(dataDir, "ax-code"), { recursive: true })
    await fsPromises.writeFile(
      path.join(dataDir, "ax-code", "auth.json"),
      JSON.stringify({ wafer: { key: "wafer-key" } }),
      "utf8",
    )
    const originalFetch = globalThis.fetch
    // The provider builds its own `AbortSignal.timeout(15_000)`; waiting it out is not a test, so the signal is
    // supplied and the mock aborts it exactly as a timeout does — aborted, with a "TimeoutError" reason.
    const controller = new AbortController()
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal)
    globalThis.fetch = vi.fn(async () => {
      controller.abort(new DOMException("The operation was aborted due to timeout", "TimeoutError"))
      throw controller.signal.reason
    })
    vi.resetModules()

    try {
      const { fetchQuota } = await import("./wafer.js")
      const result = await fetchQuota()

      expect(result.ok).toBe(false)
      expect(result.error).toBe("Request timed out")
    } finally {
      globalThis.fetch = originalFetch
      timeoutSpy.mockRestore()
      if (previousDataHome === undefined) delete process.env.XDG_DATA_HOME
      else process.env.XDG_DATA_HOME = previousDataHome
      if (previousDataDir === undefined) delete process.env.AX_CODE_DATA_DIR
      else process.env.AX_CODE_DATA_DIR = previousDataDir
      vi.resetModules()
      await fsPromises.rm(dataDir, { recursive: true, force: true })
    }
  })
})
