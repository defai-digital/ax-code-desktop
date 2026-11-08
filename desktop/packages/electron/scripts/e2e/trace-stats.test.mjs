import { describe, expect, test } from "vitest"
import { longTasksWithin, manyBlocksMarkdown, openFenceMarkdown, percentile, summarizeSamples } from "./trace-stats.mjs"

describe("trace statistics", () => {
  test("percentile uses nearest rank and ignores non-finite samples", () => {
    const values = [5, 1, 4, 2, 3, Number.NaN, undefined]
    expect(percentile(values, 50)).toBe(3)
    expect(percentile(values, 95)).toBe(5)
    expect(percentile(values, 0)).toBe(1)
    expect(percentile([], 50)).toBeNull()
  })

  test("summary reports count, p50, p95 and max", () => {
    expect(summarizeSamples([10, 20, 30, 40])).toEqual({ count: 4, p50: 20, p95: 40, max: 40 })
    expect(summarizeSamples([])).toEqual({ count: 0, p50: null, p95: null, max: null })
  })

  test("long tasks count once when they overlap the window, including straddling tasks", () => {
    const tasks = [
      { start: 0, duration: 60 }, // straddles the window start
      { start: 100, duration: 150 },
      { start: 300, duration: 55 }, // after the window
      { start: 10, duration: 20 }, // ends before the window
    ]
    expect(longTasksWithin(tasks, 50, 260)).toEqual({ count: 2, totalMs: 210, maxMs: 150, over100Ms: 1 })
    expect(longTasksWithin(tasks, 1000, 2000)).toEqual({ count: 0, totalMs: 0, maxMs: 0, over100Ms: 0 })
  })
})

describe("trace fixtures", () => {
  test("many-block Markdown reaches the target with uniquely numbered headings", () => {
    const { text, sections } = manyBlocksMarkdown(20_000)
    expect(text.length).toBeGreaterThanOrEqual(20_000)
    const headings = text.match(/^## Trace section \d+$/gm) ?? []
    expect(headings).toHaveLength(sections)
    expect(headings.at(-1)).toBe(`## Trace section ${sections - 1}`)
  })

  test("open-fence Markdown leaves the fence unterminated and ends with the marker", () => {
    const text = openFenceMarkdown(20_000, "FENCE_END")
    expect(text.length).toBeGreaterThanOrEqual(20_000)
    expect(text.match(/^```/gm)).toHaveLength(1)
    expect(text.endsWith("\nFENCE_END")).toBe(true)
  })
})
