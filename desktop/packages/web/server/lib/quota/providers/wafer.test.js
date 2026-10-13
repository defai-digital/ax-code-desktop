import { describe, expect, it } from "vitest"
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
})
