import { createRequire } from "node:module"
import { describe, expect, test } from "vitest"

const require = createRequire(import.meta.url)
const { mapWithConcurrency } = require("./map-with-concurrency.js")

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

describe("mapWithConcurrency", () => {
  test("preserves input order regardless of completion order", async () => {
    const result = await mapWithConcurrency([30, 5, 15], 3, async (ms) => {
      await delay(ms)
      return ms
    })
    expect(result).toEqual([30, 5, 15])
  })

  test("never exceeds the concurrency limit", async () => {
    let active = 0
    let peak = 0
    await mapWithConcurrency(Array.from({ length: 10 }, (_, i) => i), 3, async () => {
      active++
      peak = Math.max(peak, active)
      await delay(5)
      active--
    })
    expect(peak).toBe(3)
  })

  test("handles empty input and invalid limits", async () => {
    expect(await mapWithConcurrency([], 4, async (x) => x)).toEqual([])
    expect(await mapWithConcurrency([1, 2], 0, async (x) => x * 2)).toEqual([2, 4])
  })

  test("rejects with the first error", async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (x) => {
        if (x === 2) throw new Error("boom")
        return x
      }),
    ).rejects.toThrow("boom")
  })
})
