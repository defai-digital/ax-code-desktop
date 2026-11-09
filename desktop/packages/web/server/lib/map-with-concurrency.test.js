import { describe, expect, it } from "vitest"
import { mapWithConcurrency } from "./map-with-concurrency.js"

describe("mapWithConcurrency", () => {
  it("never runs more than the limit at once and keeps the input order", async () => {
    let inFlight = 0
    let peak = 0
    const results = await mapWithConcurrency([5, 1, 4, 2, 3, 0], 2, async (value) => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await new Promise((resolve) => setTimeout(resolve, value))
      inFlight -= 1
      return value * 10
    })

    expect(peak).toBe(2)
    expect(results).toEqual([50, 10, 40, 20, 30, 0])
  })

  it("handles an empty list", async () => {
    await expect(mapWithConcurrency([], 4, async () => 1)).resolves.toEqual([])
  })
})
