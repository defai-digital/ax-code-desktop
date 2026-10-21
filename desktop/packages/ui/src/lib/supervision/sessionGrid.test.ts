import { describe, expect, test } from "vitest"
import {
  applyGridDrop,
  clampGridRatio,
  emptySessionGrid,
  gridDropEdge,
  gridNeighbor,
  moveGridSlot,
  placedPanes,
  reorderGridSlots,
  resolveGridSession,
  restoreSessionGrid,
  sessionGridGeometry,
  resizeGridSlots,
  splitGridPane,
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

  test("shrinking keeps sessions in order and fills the remaining panes before dropping any", () => {
    const a = { sessionId: "a", directory: "/a" }
    const c = { sessionId: "c", directory: "/c" }
    expect(resizeGridSlots([a, null, c, null], 2)).toEqual([a, c])
    expect(resizeGridSlots([a, null, c, null], 1)).toEqual([a])
    expect(resizeGridSlots([a, c], 4)).toEqual([a, c, null, null])
  })

  test("drops an invalid tree and keeps a popped slot only when the flag is true", () => {
    const popped = restoreSessionGrid({
      layout: 1,
      slots: [{ sessionId: "a", directory: "/a", poppedOut: true }],
    })
    expect(popped.slots[0]).toEqual({ sessionId: "a", directory: "/a", poppedOut: true })
    const plain = restoreSessionGrid({
      layout: 1,
      slots: [{ sessionId: "a", directory: "/a", poppedOut: false }],
    })
    expect(plain.slots[0]).toEqual({ sessionId: "a", directory: "/a" })
    expect(plain.slots[0]).not.toHaveProperty("poppedOut")
    const dropped = restoreSessionGrid({
      layout: 2,
      slots: [
        { sessionId: "a", directory: "/a" },
        { sessionId: "b", directory: "/b" },
      ],
      tree: {
        kind: "split",
        id: "preset-columns",
        axis: "column",
        ratio: 0.5,
        first: { kind: "leaf", slot: 0 },
        second: { kind: "leaf", slot: 1 },
      },
    })
    expect(dropped.tree).toBeNull()
  })
})

describe("session grid arrangement", () => {
  const a = { sessionId: "a", directory: "/a" }
  const b = { sessionId: "b", directory: "/b" }
  const c = { sessionId: "c", directory: "/c" }
  const d = { sessionId: "d", directory: "/d" }
  const pair = () =>
    restoreSessionGrid({
      layout: 2,
      slots: [a, b],
      ratios: { columns: 0.5, rows: 0.5 },
    })

  test("reorder swaps the two slots and leaves every session in place once", () => {
    const slots = [a, b, c]
    const next = reorderGridSlots(slots, 0, 2)
    expect(next).toEqual([c, b, a])
    expect(next[0]).toBe(c)
    expect(next[2]).toBe(a)
    expect(next).toHaveLength(3)
    expect(new Set(next.map((slot) => slot?.sessionId)).size).toBe(3)
    expect(reorderGridSlots(slots, 1, 1)).toEqual(slots)
  })

  test("drop bands pick the nearest edge and the top-left corner stays on the left", () => {
    expect(gridDropEdge(10, 50, 100, 100)).toBe("left")
    expect(gridDropEdge(90, 50, 100, 100)).toBe("right")
    expect(gridDropEdge(50, 10, 100, 100)).toBe("top")
    expect(gridDropEdge(50, 90, 100, 100)).toBe("bottom")
    expect(gridDropEdge(50, 50, 100, 100)).toBe("center")
    expect(gridDropEdge(25, 50, 100, 100)).toBe("left")
    expect(gridDropEdge(26, 50, 100, 100)).toBe("center")
    expect(gridDropEdge(5, 5, 100, 100)).toBe("left")
    expect(gridDropEdge(0, 0, 0, 100)).toBe("center")
  })

  test("dropping on an edge docks that side of the target without copying the session", () => {
    const below = applyGridDrop(pair(), 0, 1, "bottom")
    const belowPanes = placedPanes(below)
    const movedDown = belowPanes.find((pane) => pane.slot === 0)!
    const targetDown = belowPanes.find((pane) => pane.slot === 1)!
    expect(movedDown.top).toBeGreaterThan(targetDown.top + targetDown.height)
    expect(movedDown.left).toBe(targetDown.left)
    expect(below.slots.map((slot) => slot?.sessionId)).toEqual(["a", "b"])

    const beside = applyGridDrop(pair(), 0, 1, "right")
    const besidePanes = placedPanes(beside)
    const movedRight = besidePanes.find((pane) => pane.slot === 0)!
    const targetRight = besidePanes.find((pane) => pane.slot === 1)!
    expect(movedRight.left).toBeGreaterThan(targetRight.left + targetRight.width)
    expect(movedRight.top).toBe(targetRight.top)
    expect(beside.slots).toHaveLength(2)
  })

  test("the keyboard neighbor is the pane that shares that side", () => {
    const state = pair()
    const panes = placedPanes(state)
    expect(gridNeighbor(panes, 0, "right")).toBe(1)
    expect(gridNeighbor(panes, 1, "left")).toBe(0)
    expect(gridNeighbor(panes, 0, "top")).toBeNull()
    expect(gridNeighbor(panes, 0, "bottom")).toBeNull()
    expect(moveGridSlot(state, 0, "right").slots.map((slot) => slot?.sessionId)).toEqual(["b", "a"])
    expect(moveGridSlot(state, 0, "top")).toBe(state)
  })

  test("split grows until four panes and then refuses", () => {
    const four = restoreSessionGrid({ layout: 4, slots: [a, b, c, d] })
    expect(splitGridPane(four, 0, "bottom")).toBeNull()
    expect(four.slots).toHaveLength(4)
    const three = restoreSessionGrid({ layout: 3, slots: [a, b, c] })
    const grown = splitGridPane(three, 1, "bottom")
    expect(grown?.slots).toHaveLength(4)
    expect(grown?.slots[3]).toBeNull()
    expect(grown?.tree?.kind).toBe("split")
    expect(splitGridPane(grown!, 0, "left")).toBeNull()
    expect(grown!.slots).toHaveLength(4)
  })
})

test("docking back to the preset restores the saved splitter ratio", () => {
  const initial = {
    ...emptySessionGrid(),
    layout: 2 as const,
    slots: [null, null],
    ratios: { columns: 0.4, rows: 0.5 },
  }
  const custom = applyGridDrop(initial, 0, 1, "bottom")
  expect(custom.tree).not.toBeNull()
  const restored = applyGridDrop(custom, 0, 1, "left")
  expect(restored.tree).toBeNull()
  expect(placedPanes(restored, 1000, 800)[0].width).toBeCloseTo((1000 - 6) * 0.4)
})
