import { describe, expect, test } from "vitest"
import {
  clampGridRatio,
  emptySessionGrid,
  resolveGridSession,
  restoreSessionGrid,
  sessionGridGeometry,
} from "./sessionGrid"

describe("session grid geometry", () => {
  test.each([1, 2, 3, 4] as const)("layout %i bounds every pane, including narrow viewports", (layout) => {
    for (const width of [200, 646, 1000, 2000]) {
      for (const ratio of [-1, 0, 0.5, 1, 2, NaN]) {
        const geometry = sessionGridGeometry(layout, width, 700, { columns: ratio, rows: ratio })
        expect(geometry.panes).toHaveLength(layout)
        // Wide windows keep 320px panes; narrow ones share the visible width, never below 160px, instead of overflowing.
        const minimum = layout === 1 ? Math.min(320, Math.max(160, width)) : width >= 646 ? 320 : 160
        expect(geometry.width).toBe(Math.max(width, layout === 1 ? 160 : 326))
        for (const pane of geometry.panes) {
          expect(pane.width).toBeGreaterThanOrEqual(minimum - 1e-9)
          expect(pane.height).toBeGreaterThanOrEqual(160 - 1e-9)
          expect(pane.left + pane.width).toBeLessThanOrEqual(geometry.width + 1e-9)
          expect(pane.top + pane.height).toBeLessThanOrEqual(geometry.height + 1e-9)
        }
      }
    }
  })
  test("clamp reserves 320px on both sides of the handle", () => {
    expect(clampGridRatio(0, 1006)).toBe(0.32)
    expect(clampGridRatio(1, 1006)).toBeCloseTo(0.68)
    expect(clampGridRatio(0, 300)).toBe(0.5)
  })
  test("three panes use a full left column and two right panes; four form aligned rows", () => {
    const three = sessionGridGeometry(3, 1006, 806, { columns: 0.4, rows: 0.6 })
    expect(three.panes).toEqual([
      { left: 0, top: 0, width: 400, height: 806 },
      { left: 406, top: 0, width: 600, height: 480 },
      { left: 406, top: 486, width: 600, height: 320 },
    ])
    const four = sessionGridGeometry(4, 1006, 806, { columns: 0.4, rows: 0.6 })
    expect(four.panes[0].height).toBe(four.panes[1].height)
    expect(four.panes[2].top).toBe(four.panes[3].top)
  })
})

describe("session grid restore", () => {
  test("validates malformed state and bounds slots and ratios", () => {
    for (const value of [null, undefined, [], "invalid", { layout: 99 }])
      expect(restoreSessionGrid(value)).toEqual(emptySessionGrid())
    const restored = restoreSessionGrid({
      layout: 4,
      slots: [
        { sessionId: "ok", directory: "c:\\Repo\\" },
        { sessionId: "ok", directory: "C:/repo" },
        { sessionId: 42, directory: "/x" },
        { sessionId: "bad", directory: null },
        { sessionId: "fifth", directory: "/x" },
      ],
      ratios: { columns: Infinity, rows: -1 },
    })
    expect(restored.slots).toEqual([{ sessionId: "ok", directory: "C:/Repo" }, null, null, null])
    expect(restored.ratios).toEqual({ columns: 0.5, rows: 0 })
  })
  test("missing sessions resolve empty without discarding delayed sessions or confusing directories", () => {
    const grid = restoreSessionGrid({
      layout: 2,
      slots: [
        { sessionId: "missing", directory: "/old" },
        { sessionId: "win", directory: "c:\\Repo\\" },
      ],
    })
    const rows = [
      { sessionId: "missing", directory: "/other" },
      { sessionId: "win", directory: "C:/repo" },
    ]
    expect(resolveGridSession(grid.slots[0], rows)).toBeNull()
    expect(resolveGridSession(grid.slots[1], rows)).toBe(rows[1])
    const recovered = { sessionId: "missing", directory: "/old" }
    expect(resolveGridSession(grid.slots[0], [...rows, recovered])).toBe(recovered)
  })
})
